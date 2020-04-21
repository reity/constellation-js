SBOLDocument = require('sboljs');
handleOp = require('./handleOperators');

const util = require('util');

let sequenceConstraintCount = 1;
let orRegionCount = 1;
let cycleRegionCount = 1;
let atomMap = {}; // {atomText: componentDefinition, collections}
let DESIGN_NAME = '';

const CONSTELLATION_GIT = 'https://github.com/hicsail/constellation-js';
const CONSTELLATION_URL = 'http://constellationcad.org';
const VERSION = '1';
const DELIMITER = '/';
const COLLECTION = '_collection';
const TEMPLATE = 'combinatorial_template';
const COMBINATORIAL = '_combinatorial_derivation';
const SEQUENCE_CONSTRAINT = '_sequence_constraint';
const COMPONENT = '_component';
const VARIABLE = '_variable';
const ORREGION = 'or_unit';
const ORSUBREGION = '_or_subunit';
const CYCLEREGION = 'cyclical_unit';

const ZERO_ONE_SBOL = 'ZeroOrOneSBOL';

const OPERATOR_URIS = {
  [handleOp.ZERO_MORE]: 'http://sbols.org/v2#zeroOrMore',
  [handleOp.ONE]: 'http://sbols.org/v2#one',
  [handleOp.ONE_MORE]: 'http://sbols.org/v2#oneOrMore',
  [handleOp.ZERO_ONE]: 'http://sbols.org/v2#zeroOrOne',
};

const SEQUENCE_CONSTRAINT_URIS = {
  PRECEDE: 'http://sbols.org/v2#precedes',
  SAMEORIENTATION: 'http://sbols.org/v2#sameOrientationAs',
  OPPOSITEORIENTATION: 'http://sbols.org/v2#oppositeOrientationAs',
  DIFFERENT: 'http://sbols.org/v2#differentFrom'
};


/****************
 * HELPERS
 ****************/
function getRootId(stateGraph){
  for (let id in stateGraph) {
    if (stateGraph[id].text === handleOp.ROOT){
      return id;
    }
  }
}

/**
 * Collapses the stack when there is only one atom inside a MORE
 * @param stack
 */
function collapseStack(stack){
  for(let i=0; i<stack.length; i++){
    let key = Object.keys(stack[i])[0];
    if (key ===handleOp.THEN){
      stack.splice(i,1); //remove THENs
    }
  }
  if(stack.length > 2){
    for(let i=0; i<stack.length-2; i++){
      let key = Object.keys(stack[i])[0];
      if (key === handleOp.ONE_MORE || key === handleOp.ZERO_MORE || key === handleOp.ZERO_ONE){
        if (Object.keys(stack[i+1])[0] === handleOp.ATOM && Object.keys(stack[i+2])[0] === 'end'){
          stack[i][key] = [stack[i+1].atom];
          stack.splice(i+1,1);
          stack.splice(i+1,1);
        }
      }
    }
  }
}

function addToStacks(doc, stacks, name, operator, variantDerivations, collections){
  if (!collections){
    collections = [];
    if (atomMap[name]){
      collections = atomMap[name].collections;
    }
  }
  const componentDefinition = makeComponentDefinition(doc, name);
  if (stacks.templates.length > 0){
    // if there's already a template on the stack, then add component to the template
    const lastTemplate = stacks.templates[stacks.templates.length-1].template;
    const component = makeComponent(doc, componentDefinition, lastTemplate);
    lastTemplate.addComponent(component);
    stacks.variantComponents.push(createVariantComponentObj(operator, component, variantDerivations, collections));
  } else{
    // else, this is a new componentDef for the root
    stacks.componentDefs.push(createComponentDefObj(operator, componentDefinition, variantDerivations, collections));
  }
}

function addComponentsAndRestraintsToTemplate(doc, templateCD, stack, cv){
  if (!cv){
    cv = makeCombinatorialDerivation(doc, templateCD);
  }
  let subject;
  let object;

  for(let stackObj of stack){
    let component = stackObj.component;
    if(!component){
      component = makeComponent(doc, stackObj.componentDef, templateCD);
      templateCD.addComponent(component);
    }

    const variableComponent = makeVariableComponent(doc, cv.persistentIdentity, component, stackObj.operator,
      stackObj.variantDVs, stackObj.collections);
    cv.addVariableComponent(variableComponent);

    object = component;
    if (subject && object){
      const sequenceConstraint = makeSequenceConstraint(doc, templateCD, subject, object);
      templateCD.addSequenceConstraint(sequenceConstraint);
    }
    subject = object;
  }
  return cv;
}

function createVariantComponentObj(operator, component, variantDVs, collections){
  return {
    operator: operator,
    component: component,
    variantDVs: variantDVs,
    collections: collections
  }
}

function createComponentDefObj(operator, componentDef, variantDVs, collections){
  return {
    operator: operator,
    componentDef: componentDef,
    variantDVs: variantDVs,
    collections: collections
  }
}

function createTemplateObj(operator, template, combDV, id){
  return {
    operator: operator,
    template: template, //component definition
    combDV: combDV, //combinatorial derivation
    id: id
  }
}

/****************
 * SBOL HELPERS
 ****************/

/**
 *
 * @param doc {SBOLDocument}
 * @param name key in categories
 */
function makeCollection(doc, name){
  const persistentId = CONSTELLATION_URL + DELIMITER + name + COLLECTION + DELIMITER + name;
  const collection = doc.collection(persistentId + DELIMITER + VERSION);
  collection.displayId = name;
  collection.persistentIdentity = persistentId;
  collection.version = VERSION;

  return collection;
}

function makeCombinatorialDerivation(doc, templateComponentDefinition){
  const displayId = templateComponentDefinition.displayId + COMBINATORIAL;
  const persistentId = templateComponentDefinition.persistentIdentity + DELIMITER + displayId;
  const combinatorialDerivation = doc.combinatorialDerivation(persistentId + DELIMITER + VERSION);
  combinatorialDerivation.template = templateComponentDefinition;
  combinatorialDerivation.displayId = displayId;
  combinatorialDerivation.persistentIdentity = persistentId;
  combinatorialDerivation.version = VERSION;

  return combinatorialDerivation;
}

/*
temporary function so that atoms/variants are consistent
TODO remove after we can fetch from SBH
*/
function makeAtomComponentDefinition(doc, name, roles){
  /* code for using SBH URIs for persistentIDs instead of creating new ones:
  // let persistentId;
  // let match = name.match(/^[A-Za-z]\\w*$/);
  // if (match === name) {
  //   atomMap[name] = {};
  //   atomMap[name].componentDefinition = name;
  //   return name;
  // }
   */
  const prefix = CONSTELLATION_URL + DELIMITER + 'generic_definition/';
  const persistentId = prefix + name;
  const componentDefinition = doc.componentDefinition(persistentId + DELIMITER + VERSION);
  componentDefinition.displayId = name;
  componentDefinition.persistentIdentity = persistentId;
  componentDefinition.version = VERSION;
  for (let role of roles) {
    const sbolROLE = SBOLDocument.terms[role]; //clarifies the potential function of the entity
    if (sbolROLE){
      componentDefinition.addRole(sbolROLE);
    } else {
      componentDefinition.addRole(SBOLDocument.terms.engineeredRegion);
    }
  }
  componentDefinition.addType(SBOLDocument.terms.dnaRegion); //specifies the category of biochemical or physical entity

  //add to atomMap
  atomMap[name] = {};
  atomMap[name].componentDefinition = componentDefinition;
  return componentDefinition;
}

function makeComponentDefinition(doc, name, makeTemplate, makeRoot){
  if(name in atomMap && !makeTemplate && !makeRoot){
    return atomMap[name].componentDefinition;
  }

  const PREFIX = CONSTELLATION_URL + DELIMITER + DESIGN_NAME + DELIMITER;
  const ROOT_PREFIX = PREFIX + 'root_template' + DELIMITER;
  const TEMPLATE_PREFIX = PREFIX + TEMPLATE + DELIMITER;

  let displayId =  name;
  const prefix = makeRoot? ROOT_PREFIX: makeTemplate? TEMPLATE_PREFIX : PREFIX;
  const persistentId = prefix + displayId;
  const componentDefinition = doc.componentDefinition(persistentId + DELIMITER + VERSION);
  componentDefinition.displayId = displayId;
  componentDefinition.persistentIdentity = persistentId;
  componentDefinition.version = VERSION;
  const role = SBOLDocument.terms[name];
  if (role){
    componentDefinition.addRole(role);
  }
  componentDefinition.addType(SBOLDocument.terms.engineeredRegion);

  //add to atomMap
  if(!makeTemplate && !makeRoot){
    atomMap[name] = {};
    atomMap[name].componentDefinition = componentDefinition;
  }
  return componentDefinition;
}

function makeComponent(doc, componentDefinition, template){
  let num = 1;
  // make name unique if component is already in the template
  for (comp of template.components){
    if (comp.definition.uri === componentDefinition.uri){
      num = Number.parseInt(comp.displayId[comp.displayId.length -1], 10) + 1;
    }
  }

  const displayId = componentDefinition.displayId + COMPONENT + num;
  const persistentId =  template.persistentIdentity + DELIMITER + displayId;
  const atomComponent = doc.component(persistentId + DELIMITER + VERSION);
  atomComponent.displayId = displayId;
  atomComponent.persistentIdentity = persistentId;
  atomComponent.version = VERSION;
  atomComponent.definition = componentDefinition;
  return atomComponent;
}

function makeVariableComponent(doc, templateId, component, operator, variantDerivations, collections){
  let displayId = component.displayId + VARIABLE;
  const persistentId = templateId + DELIMITER + displayId;
  const variableComponent = doc.variableComponent(persistentId + DELIMITER + VERSION);
  variableComponent.displayId = displayId;
  variableComponent.persistentIdentity = persistentId;
  variableComponent.version = VERSION;
  variableComponent.variable = component;
  variableComponent.operator = OPERATOR_URIS[operator];

  if(collections){
    collections.forEach(function(collection) {
      variableComponent.addVariantCollection(collection);
    });
  }

  if(variantDerivations){
    variantDerivations.forEach(function(vd) {
      variableComponent.addVariantDerivation(vd);
    });
  }

  return variableComponent;
}

function makeSequenceConstraint(doc, templateCD, subject, object){
  //subject precedes object
  let displayId = templateCD.displayId + SEQUENCE_CONSTRAINT + sequenceConstraintCount;
  const persistentId =  templateCD.persistentIdentity + DELIMITER + displayId;
  const sequenceConstraint = doc.sequenceConstraint(persistentId + DELIMITER + VERSION);
  sequenceConstraint.displayId = displayId;
  sequenceConstraint.persistentIdentity = persistentId;
  sequenceConstraint.version = VERSION;
  sequenceConstraint.subject = subject;
  sequenceConstraint.object = object;
  sequenceConstraint.restriction = SEQUENCE_CONSTRAINT_URIS.PRECEDE;
  sequenceConstraintCount += 1;

  return sequenceConstraint
}

function getParents(stateGraph){
  let pMap = {};
  for (let node in stateGraph) {
    stateGraph[node].edges.forEach((edge) =>{
      if(!(edge.dest in pMap)){
        pMap[edge.dest] = new Set();
      }
      pMap[edge.dest].add(edge.src);
    });
  }
  return pMap;
}


/**
 * breadth width search of the state graph
 * to create a structure that is better for SBOL generation
 * @param stateGraph constellation graph for visualization
 * @param stateStack structure that SBOL is generated from
 * @param id the id to start the traverse from
 * @param edgeUsed the edge used to get to stateGraph[id] (edgeUsed.dest should be id)
 */
function makeStackFromStateGraph(stateGraph, stateStack, id, edgeUsed){
  // console.log('in MAKE ', pMap);
  let endIds = []; //prevent redundant ends
  let queue = [];
  let edgeQueue = [];
  queue.push(id);
  edgeQueue.push(edgeUsed);
  while (queue.length !== 0){
    let id = queue.shift();
    let edgeUsed = edgeQueue.shift();
    // if node has been visited and we got here using a non-Atom, push to endIds
    if (stateGraph[id].visited){
      if (edgeUsed.type === handleOp.ATOM) {
        stateStack.push({atom: edgeUsed.text});
      }
      if (stateGraph[id].operator.includes(handleOp.ZERO_MORE) || stateGraph[id].operator.includes(handleOp.ONE_MORE)) {
        if (!endIds.includes(id)) {
          stateStack.push({end: id});
          endIds.push(id);
        } else if (stateGraph[id].operator.filter(op => op === handleOp.ONE_MORE || op === handleOp.ZERO_MORE).length > 1) {
          stateStack.push({end: id});
          endIds.push(id);
        }
      }
      continue;
    }
    // if we used an atom to get to stateGraph[id], push atom to stack
    if (edgeUsed.type === handleOp.ATOM){
      stateStack.push({atom: edgeUsed.text});
    }

    // handle immediate cycles first (node 1 to node 2 and back)
    let immediateCycles = stateGraph[id].edges.filter(e => e.dest === edgeUsed.src);
    if (immediateCycles.length > 0) {
      for (let edge of immediateCycles) {
        if (edge.component === handleOp.ATOM) {
          stateStack.push({atom: edge.text});
        }
        if (stateStack[stateStack.length - 1].end !== edge.dest) {
          stateStack.push({end: edge.dest});
          endIds.push(edge.dest);
        }
      }
    }

    // handle the operations at this node (OR is only non-null case for lastEdge)
    let lastEdge = handleOperations(stateGraph, stateStack, id, endIds, edgeUsed);
    stateGraph[id].visited = true;
    if (lastEdge){ //from OR
      id = lastEdge;
      handleOperations(stateGraph, stateStack, id, endIds, edgeUsed);
      stateGraph[id].visited = true;
    }
    // push destinations of stateGraph[id]'s edges
    let nonCycles = stateGraph[id].edges.filter(e => e.dest !== edgeUsed.src);
    let dests = [];
    let nextEdges = [];
    for (let edge of nonCycles) {
      dests.push(edge.dest);
      nextEdges.push(edge);
    }
    queue.push(...dests);
    edgeQueue.push(...nextEdges); // push edges
  }
}

function handleOperations(stateGraph, stack, id, endIds, edgeUsed) {
  let lastEdge;
  // handle THENs first
  if (stateGraph[id].operator.includes(handleOp.THEN)) {
    stack.push({[handleOp.THEN]: id});
  }
  // then handle anything except for ORs
  for (let operation of stateGraph[id].operator) {
    if (operation !== handleOp.OR && operation !== handleOp.THEN) {
      stack.push({[operation]: id});
    }
  }
  // then handle ORs
  for (let operation of stateGraph[id].operator) {
    if (operation === handleOp.OR) {
      let temp = traverseOr(stateGraph, stack, id, endIds, edgeUsed);
      if (temp !== undefined && temp !== null) {
        lastEdge = temp;
      }
    }
  }
  return lastEdge;
}

/**
 * The OR operator must be done depth first
 **/
function traverseOr(stateGraph, stateStack, id, endIds, edgeUsed) {
  let orStack = [];
  let lastEdge;
  stateStack.push({[handleOp.OR]: orStack});
  stateGraph[id].visited = true;
  let nonCycles = stateGraph[id].edges.filter(e => e.dest !== edgeUsed.src);
  nonCycles.forEach(function (edge) {
    let orSubStack = [];
    let temp = traverseOrEdges(stateGraph, stateStack, orSubStack, edge.dest, edge, endIds, edgeUsed);
    if (temp !== undefined && temp !== null) {
      lastEdge = temp;
    }
    if (orSubStack.length !== 0) {
      orStack.push(orSubStack);
    }
  });
  return lastEdge;
}

function traverseOrEdges(stateGraph, stack, subStack, id, edgeUsed, endIds, prevEdgeUsed, moreStartId) {
  if (stateGraph[id].visited) {
    // if the MORE started within the OR, then end it on this stack
    if (id === moreStartId) {
      subStack.push({end: id});
      endIds.push(id);
    } // else end it on the original stack
    else if (stateGraph[id].operator.includes(handleOp.ONE_MORE)
      || stateGraph[id].operator.includes(handleOp.ZERO_MORE)
      || stateGraph[id].operator.includes(handleOp.ZERO_ONE)) {
      if (stack[stack.length - 1].end !== id) {
        stack.push({end: id});
        if (!endIds.includes(id)) {
          endIds.push(id);
        }
      }

    } else if (edgeUsed.type === handleOp.ATOM) { // in case of zero-or-one
      subStack.push({atom: edgeUsed.text});
    }
    return null;
  }

  if (edgeUsed.type === handleOp.ATOM) {
    subStack.push({atom: edgeUsed.text});
  }

  if (stateGraph[id].operator.length === 1 &&
    (stateGraph[id].operator[0] === handleOp.ONE_MORE ||
      stateGraph[id].operator[0] === handleOp.ZERO_MORE ||
      stateGraph[id].operator[0] === handleOp.ZERO_ONE)) {
    moreStartId = id;
  }

  if (edgeUsed.type === handleOp.EPSILON && stateGraph[id].operator.includes(handleOp.THEN)) {
    stateGraph[id].visited = false; //reset
    return id; //a 'then' that's not on the atom is not part of the OR
  }

  let lastEdge;
  for (let operation of stateGraph[id].operator) {
    if (operation === handleOp.OR){
      lastEdge = traverseOr(stateGraph, subStack, id, endIds, prevEdgeUsed);
    } else {
      subStack.push({[operation]: id});
    }
  }

  stateGraph[id].visited = true;
  if (lastEdge) { //from OR
    id = lastEdge;
    handleOperations(stateGraph, subStack, id, endIds, prevEdgeUsed);
  }
  for (let edge of stateGraph[id].edges) {
    lastEdge = traverseOrEdges(stateGraph, stack, subStack, edge.dest, edge, endIds, prevEdgeUsed, moreStartId);
  }
  return lastEdge; //the last node of the OR chain
}

/**
 * Traverse the stack to make the SBOL
 * @param doc SBOL doc
 * @param stateStack custom stack generated from Constellation state graph
 * @param componentDefStack Component Definitions returned to one level above
 */
function makeSBOLFromStack(doc, stateStack, componentDefStack){
  let stacks = {};
  stacks.templates = [];
  stacks.variantComponents = [];
  stacks.componentDefs = componentDefStack;
  collapseStack(stateStack);
  // console.log(JSON.stringify(stateStack, null, 2));

  stateStack.forEach(function(stackObj){
    const key = Object.keys(stackObj)[0];
    switch (key) {
      case handleOp.ATOM:
        addToStacks(doc, stacks, stackObj[key], 'one', null, null);
        break;
      case handleOp.OR:
        let orIdentity = ORREGION + orRegionCount;
        orRegionCount += 1;
        let variantDerivations = [];
        let orCollections = [];
        addToStacks(doc, stacks, orIdentity, 'one', variantDerivations, orCollections);

        let orSubRegionCount = 1;
        for (let orRegion of stackObj[key]){
          let orStack = [];
          makeSBOLFromStack(doc, orRegion, orStack);
          if (orStack.length === 1 && orStack[0].operator === 'one'){
            orCollections.push(...orStack[0].collections);
          } else {
            let orSubIdentity = orIdentity + ORSUBREGION + orSubRegionCount;
            orSubRegionCount += 1;
            const orTemplate = makeComponentDefinition(doc, orSubIdentity, true);
            const cv = addComponentsAndRestraintsToTemplate(doc, orTemplate, orStack);
            variantDerivations.push(cv);
          }
        }
        break;
      case handleOp.ONE_MORE: //fall through
      case handleOp.ZERO_MORE:
      case handleOp.ZERO_ONE:
        // only one atom within the -or-more operator
        if (Array.isArray(stackObj[key])){
          addToStacks(doc, stacks, stackObj[key][0], key, null, null);
        } else{
          let identity = CYCLEREGION + cycleRegionCount;
          cycleRegionCount += 1;
          const templateCD = makeComponentDefinition(doc, identity, true);
          const cv = makeCombinatorialDerivation(doc, templateCD);
          addToStacks(doc, stacks, identity, key, [cv], null);
          stacks.templates.push(createTemplateObj(key, templateCD, cv, stackObj[key]));
        }
        break;
      case 'end':
        // remove the last template
        const index = stacks.templates.indexOf(template => template.id === stackObj[key]);
        const templateObj = stacks.templates.splice(index, 1)[0];
        const cv = templateObj.combDV;

        // get length of components under the CD and pop
        // the same number from the temp VariantComponent stack
        const lengthOfComponents = templateObj.template._components.length;
        let componentsStack = stacks.variantComponents.splice(stacks.variantComponents.length-lengthOfComponents, lengthOfComponents);
        addComponentsAndRestraintsToTemplate(doc, templateObj.template, componentsStack, cv);
        break;
    }
  });
}


function generateCombinatorialSBOL(stateGraph, categories, designName, numDesigns, maxCycles){
  const doc = new SBOLDocument();
  DESIGN_NAME = designName;

  // traverse stateGraph and mark all as not visited
  //create ComponentDefinition for every atom and add to atomMap
  Object.keys(stateGraph).forEach(function(id){
    stateGraph[id].visited = false;
    for (let edge of stateGraph[id].edges) {
      let atomType = edge.type;
      let atomText = edge.text;
      if (atomType === handleOp.ATOM && !(atomText in atomMap)){
        /** @type {Collection} */
        let collection = makeCollection(doc, atomText);
        makeAtomComponentDefinition(doc, atomText, Object.keys(categories[atomText]));

        for (let role in categories[atomText]) {
          for (let id of categories[atomText][role]) {
            collection.addMember(makeAtomComponentDefinition(doc, id, [role]));
            if (!atomMap[atomText].collection){
              atomMap[atomText].collections = [];
            }
            atomMap[atomText].collections.push(collection);
          }
        }
      }
    }

  });



  //create a stateStack from the stateGraph
  const rootId = getRootId(stateGraph);
  let dummyEdge = {'src': 'dummy',
    'dest': rootId,
    'component': handleOp.EPSILON,
    'type': handleOp.EPSILON,
    'text': handleOp.EPSILON
  };
  let stateStack = [];
  makeStackFromStateGraph(stateGraph, stateStack, rootId, dummyEdge);
  // console.log(util.inspect(stateStack, {showHidden: false, depth: null}));
  //use stateStack to generate SBOL
  let componentDefStack = [];
  makeSBOLFromStack(doc, stateStack, componentDefStack);

  // Make root CD and CV
  const rootTemplate = makeComponentDefinition(doc, designName, false, true);
  const rootCV = addComponentsAndRestraintsToTemplate(doc, rootTemplate, componentDefStack);

  // add custom attributes to root CV
  // Github README should explain the custom attributes
  rootCV.addStringAnnotation(CONSTELLATION_GIT + DELIMITER + "numDesigns", numDesigns);
  rootCV.addStringAnnotation(CONSTELLATION_GIT + DELIMITER + "maxCycles", maxCycles);

  //clean up
  sequenceConstraintCount = 1;
  orRegionCount = 1;
  cycleRegionCount = 1;
  for (let atom in atomMap) delete atomMap[atom];

  return doc.serializeXML();
}

let sbol = generateCombinatorialSBOL;

module.exports = sbol;