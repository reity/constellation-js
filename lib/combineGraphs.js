const constants = require('./constants');
const andOperator = require('./andOperator');
const mergeOperator = require('./mergeOperator');
EdgeGraph = require('./edgeGraph');

/**
 * Combines graphs sequentially with specified method
 * @param combineMethod String specifying which method of AND or MERGE
 * @param stateGraphObj Object of stateGraphs to be combined
 * @param categories Object of each graph's categories
 * @param tolerance Tolerance level of combined method (0-2)
 * @returns Object of combined graph, its categories, and the new paths
 */
function combineGraphs(combineMethod, stateGraphObj, categories, tolerance) {

  let combined;
  // call the correct handler method on the stateGraphs
  if (combineMethod === constants.AND) {
    combined = linearCall(handleAnd, stateGraphObj, categories, tolerance);

  } else if (combineMethod === constants.MERGE) {
    combined = linearCall(handleMerge, stateGraphObj, categories, tolerance);

  } else {
    throw new Error('Invalid combine method');
  }

  //if the graph is empty at the end (and/merge was unsuccessful) return an empty graph
  if (combined.graph.equals(new EdgeGraph())) {
    return {graph: combined.graph, categories: {}};
  }

  return {graph: combined.graph, categories: combined.categories};
}

/**
 * Calls whichever handler function on the graphs sequentially
 * @param handleFunc Function: the function to call on each item in the object
 * @param graphObj Object: the stateGraphs of all the submitted designs
 * @param categories Object: original list of categories per stateGraph
 * @param tolerance Tolerance level of combined method (0-2)
 * @return {{categories: Object, graph: Object}}
 */
function linearCall(handleFunc, graphObj, categories, tolerance) {
  // do one iteration before the loop
  let firstIter = handleFunc(graphObj[0], graphObj[1], categories[0], categories[1], tolerance);
  let finalGraph = firstIter.graph;
  let finalCategories = firstIter.categories;
  // all subsequent and/merges must happen in relation to the first and/merge
  for (let i = 2; i < Object.keys(graphObj).length; i++) {
    let nextIter = handleFunc(finalGraph, graphObj[i], finalCategories, categories[i], tolerance);
    finalGraph = nextIter.graph;
    finalCategories = nextIter.categories;
  }
  return {graph: finalGraph, categories: finalCategories};
}


/**
 * Called if combine method is AND; and's one pair of graphs
 * @param graph1 Object representing the left side of the and
 * @param graph2 Object representing the right side of the and
 * @param categories1 Object of first graph's categories
 * @param categories2 Object of second graph's categories
 * @param tolerance Tolerance level of combined method (0-2)
 * @returns Object: {categories: combined categories, graph: combined graph}
 */
function handleAnd(graph1, graph2, categories1, categories2, tolerance) {
  // object to hold the categories from the final graph
  let finalCategories = {};
  let newGraph = cartesianNodes(graph1, graph2);

  // do the AND algorithm on the new graph
  andOperator.andOperator(newGraph, graph1, graph2, categories1, categories2, finalCategories, tolerance);
  // rename the ids of the new graph so that they have the form id1-id2 (instead of an array of ids)
  newGraph = renameIds(newGraph);
  // remove nodes and edges that do not belong to path
  andOperator.removeNonPaths(newGraph);

  return {graph: newGraph, categories: finalCategories};
}


/**
 * Called if combine method is MERGE; merges pairs of graphs sequentially
 * @param graph1 Object representing the left side of the merge
 * @param graph2 Object representing the right side of the merge
 * @param categories1 Object of each first graph's categories
 * @param categories2 Object of each second graph's categories
 * @param tolerance Tolerance level of combined method (0-2)
 * @returns Object: Merge of both graphs
 */
function handleMerge(graph1, graph2, categories1, categories2, tolerance) {
  // object to hold the categories from the final graph
  let finalCategories = {};
  let newGraph = cartesianNodes(graph1, graph2);
  mergeOperator.mergeOperator(newGraph, graph1, graph2, categories1, categories2, finalCategories, tolerance);
  // rename the ids of the new graph so that they have the form id1-id2 (instead of an array of ids)
  newGraph = renameIds(newGraph);

  mergeOperator.removeNonPaths(newGraph);

  return {graph: newGraph, categories: finalCategories};
}


/**
 * Returns a list of node-pairs that make up the
 * cartesian product of the nodes in the two graphs
 * @param graph1 Object: the first graph
 * @param graph2 Object: the second graph
 * @returns Object: graph with nodes labeled as node pairs of original graphs
 */
function cartesianNodes(graph1, graph2) {
  // object to hold new graph
  let nodes = new EdgeGraph();
  for (let id1 of graph1.nodes) {
    let node1 = graph1.get(id1);
    for (let id2 of graph2.nodes) {
      let node2 = graph2.get(id2);
      let newID = [id1, id2];
      let type = '';
      let text = '';
      let operator = [];
      // if both nodes are roots, the new node is also a root; if both are accepts, new node is an accept
      if (node1.type === constants.ROOT && node2.type === constants.ROOT) {
        type = constants.ROOT;
      } else if (node1.type === constants.ACCEPT && node2.type === constants.ACCEPT) {
        type = constants.ACCEPT;
      } else {
        type = constants.EPSILON;
      }

      // if both nodes' texts are 'root', the new node's text is also 'root'; if both are 'accept', new node is 'accept'
      if (node1.text === constants.ROOT && node2.text === constants.ROOT) {
        text = constants.ROOT;
      } else if (node1.text === constants.ACCEPT && node2.text === constants.ACCEPT) {
        text = constants.ACCEPT;
      } else {
        text = constants.EPSILON;
      }

      if (node1.type === constants.ACCEPT || node2.type === constants.ACCEPT) {
        operator = [];
      } else {
        operator = assignOperators(node1.operator, node2.operator);
      }

      // insert new node into new graph
      let newNode = {
        id: newID,
        text: text,
        type: type,
        edges: [],
        operator: operator
      };
      nodes.addNode(newNode);
    }
  }
  return nodes;
}

function assignOperators(opArr1, opArr2) {
  let finalOps = [];
  // if there are any THENs, push a THEN onto the operators
  if (opArr1.includes(constants.THEN) || opArr2.includes(constants.THEN)) {
    finalOps.push(constants.THEN);
  }
  // only THENs should be carried regardless,
  // all other operators should only be carried if both nodes have operators
  if (opArr1.length === 0 || opArr2.length === 0) {
    return finalOps;
  }
  // if the first node is a OM, as long as the other node is not a ZO, push a OM onto the operators
  if (opArr1.includes(constants.ONE_MORE)) {
    if (!opArr2.includes(constants.ZERO_ONE)) {
      finalOps.unshift(constants.ONE_MORE);
    }
  }
  // if the first node is a ZM
  if (opArr1.includes(constants.ZERO_MORE)) {
    // if the other node is a ZO, push a ZO
    if (opArr2.includes(constants.ZERO_ONE)) {
      finalOps.push(constants.ZERO_ONE);
    } else if (opArr2.includes(constants.ONE_MORE)) {
      // if the other node is a OM, push an OM
      finalOps.unshift(constants.ONE_MORE);
    } else {
      // if the other node is neither ZO nor OM, push a ZM
      finalOps.push(constants.ZERO_MORE);
    }
  }
  // if the first node is a ZO, push a ZO only if the other node is a ZM or ZO
  if (opArr1.includes(constants.ZERO_ONE)) {
    if (opArr2.includes(constants.ZERO_MORE) || opArr2.includes(constants.ZERO_ONE)) {
      finalOps.push(constants.ZERO_ONE);
    }
  }
  return [...new Set(finalOps)]
}


/**
 * Renames the ids in a graph from the form [id1, id2] to the form id1-id2
 * @param graph
 */
function renameIds(graph) {
  let renamedGraph = new EdgeGraph();
  for (let id of graph.nodes) {
    let node = graph.get(id);
    let newId = node.id.join('-');
    node.id = newId;

    for (let edge of node.edges) {
      edge.src = newId;
      edge.dest = edge.dest.join('-');
    }
    renamedGraph.addNode(node);
  }
  return renamedGraph;

}

module.exports = {
  combineGraphs,
};

