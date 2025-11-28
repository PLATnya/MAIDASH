
var cy = cytoscape({
    container: document.getElementById('cy'),
    
    elements: [],
    
    style: [{
        selector: 'node',
        style: {
            'width': 100,
            'height': 100,
            'shape': 'rectangle',
            'background-color': '#3498db',
            'border-width': 2,
            'border-color': '#2980b9',
            'label': 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            'color': '#ffffff',
            'font-size': '16px',
            'font-weight': 'bold'
        }
    }, {
        selector: 'edge',
        style: {
            'width': 2,
            'line-color': '#666',
            'curve-style': 'bezier',
            'target-arrow-shape': 'none'
        }
    }, {
        selector: 'node.linking-source',
        style: {
            'border-color': '#e74c3c',
            'border-width': 4
        }
    }, {
        selector: 'node.resizing',
        style: {
            'border-color': '#27ae60',
            'border-width': 3
        }
    }]
});

// Get container element
var container = document.getElementById('cy');

// Counter for unique node IDs
var nodeIdCounter = 0;
var edgeIdCounter = 0;

// Linking mode variables
var linkingMode = false;
var sourceNodeForLink = null;

// Variable to store the current input box and click position
var textInputBox = null;
var clickPosition = null;
var graphPosition = null;
var mousePosition = null;
var contextMenu = null;
var selectedNode = null;
var selectedEdge = null;
var isNodeRightClick = false;
var isEdgeRightClick = false;

// Resizing variables
var resizingMode = false;
var nodeBeingResized = null;
var resizeStartWidth = 0;
var resizeStartHeight = 0;
var resizeStartMouseX = 0;
var resizeStartMouseY = 0;
// Helper function to convert screen coordinates to graph coordinates
function screenToGraph(screenX, screenY) {
    var containerRect = container.getBoundingClientRect();
    var x = screenX - containerRect.left;
    var y = screenY - containerRect.top;
    
    var pan = cy.pan();
    var zoom = cy.zoom();
    var centerX = containerRect.width / 2;
    var centerY = containerRect.height / 2;
    
    // Convert: graphPos = (screenPos - center - pan) / zoom
    // Cytoscape Y axis points up (mathematical coordinates), screen Y points down
    return {
        // x: (x - centerX - pan.x) / zoom,
        // y: -(y - centerY - pan.y) / zoom  // Invert Y axis
        x: (x - centerX ) / zoom,
        y: -(y - centerY) / zoom  // Invert Y axis
    };
}

// Function to remove context menu
function removeContextMenu() {
    if (contextMenu) {
        contextMenu.remove();
        contextMenu = null;
        selectedNode = null;
        selectedEdge = null;
        isNodeRightClick = false;
        isEdgeRightClick = false;
    }
}

// Function to create context menu
function createContextMenu(x, y, node) {
    // Remove existing context menu if any
    removeContextMenu();
    
    selectedNode = node;
    
    // Create context menu container
    contextMenu = document.createElement('div');
    contextMenu.style.position = 'absolute';
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.style.backgroundColor = '#ffffff';
    contextMenu.style.border = '1px solid #ccc';
    contextMenu.style.borderRadius = '4px';
    contextMenu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    contextMenu.style.zIndex = '1001';
    contextMenu.style.minWidth = '150px';
    contextMenu.style.padding = '4px 0';
    
    // Create menu items
    var menuItems = [
        { label: 'Edit', action: function() { editNode(node); } },
        { label: 'Resize', action: function() { startResizing(node, 0, 0); } },
        { label: 'Link', action: function() { startLinking(node); } },
        { label: 'Delete', action: function() { deleteNode(node); } }
    ];
    
    menuItems.forEach(function(item) {
        var menuItem = document.createElement('div');
        menuItem.textContent = item.label;
        menuItem.style.padding = '8px 16px';
        menuItem.style.cursor = 'pointer';
        menuItem.style.fontSize = '14px';
        menuItem.style.color = '#333';
        
        menuItem.addEventListener('mouseenter', function() {
            menuItem.style.backgroundColor = '#f0f0f0';
        });
        menuItem.addEventListener('mouseleave', function() {
            menuItem.style.backgroundColor = 'transparent';
        });
        
        menuItem.addEventListener('click', function() {
            item.action();
            removeContextMenu();
        });
        
        contextMenu.appendChild(menuItem);
    });
    
    document.body.appendChild(contextMenu);
}

// Function to edit node
function editNode(node) {
    var currentLabel = node.data('label') || '';
    
    // Remove existing input box if any
    if (textInputBox) {
        textInputBox.remove();
        textInputBox = null;
    }
    
    // Get node position on screen
    var nodePos = node.renderedPosition();
    var containerRect = container.getBoundingClientRect();
    var screenX = containerRect.left + nodePos.x;
    var screenY = containerRect.top + nodePos.y;
    
    // Create input text box at node position
    textInputBox = document.createElement('input');
    textInputBox.type = 'text';
    textInputBox.style.position = 'absolute';
    textInputBox.style.left = screenX + 'px';
    textInputBox.style.top = screenY + 'px';
    textInputBox.style.transform = 'translate(-50%, -50%)';
    textInputBox.style.padding = '8px 12px';
    textInputBox.style.fontSize = '14px';
    textInputBox.style.border = '2px solid #3498db';
    textInputBox.style.borderRadius = '5px';
    textInputBox.style.zIndex = '1000';
    textInputBox.style.outline = 'none';
    textInputBox.style.backgroundColor = '#ffffff';
    textInputBox.value = currentLabel;
    
    document.body.appendChild(textInputBox);
    textInputBox.focus();
    textInputBox.select();
    
    // Handle Enter key to update node label
    textInputBox.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            var newLabel = textInputBox.value.trim();
            if (newLabel) {
                node.data('label', newLabel);
            }
            textInputBox.remove();
            textInputBox = null;
        } else if (e.key === 'Escape') {
            textInputBox.remove();
            textInputBox = null;
        }
    });
    
    // Close on blur
    textInputBox.addEventListener('blur', function() {
        setTimeout(function() {
            if (textInputBox) {
                textInputBox.remove();
                textInputBox = null;
            }
        }, 200);
    });
}

// Function to delete node
function deleteNode(node) {
    cy.remove(node);
}

// Function to delete edge
function deleteEdge(edge) {
    cy.remove(edge);
}

// Function to start resizing a node
function startResizing(node, mouseX, mouseY) {
    // Cancel any existing resize mode
    cancelResizing();
    
    // Cancel linking mode if active
    if (linkingMode) {
        cancelLinking();
    }
    
    // Set resizing mode
    resizingMode = true;
    nodeBeingResized = node;
    
    // Store initial node dimensions
    resizeStartWidth = node.width();
    resizeStartHeight = node.height();
    
    // Store initial mouse position
    resizeStartMouseX = mouseX || 0;
    resizeStartMouseY = mouseY || 0;
    
    // Add visual indicator
    node.addClass('resizing');
    
    // Change cursor
    container.style.cursor = 'nwse-resize';
}

// Function to cancel resizing mode
function cancelResizing() {
    if (nodeBeingResized) {
        nodeBeingResized.removeClass('resizing');
    }
    resizingMode = false;
    nodeBeingResized = null;
    resizeStartWidth = 0;
    resizeStartHeight = 0;
    resizeStartMouseX = 0;
    resizeStartMouseY = 0;
    container.style.cursor = '';
}

// Function to resize node based on mouse movement
function resizeNode(mouseX, mouseY) {
    if (!resizingMode || !nodeBeingResized) {
        return;
    }
    
    // Get node position
    var nodePos = nodeBeingResized.renderedPosition();
    var containerRect = container.getBoundingClientRect();
    
    // Calculate distance from node center to mouse
    var nodeScreenX = containerRect.left + nodePos.x;
    var nodeScreenY = containerRect.top + nodePos.y;
    
    // Calculate new dimensions based on distance from center
    var deltaX = mouseX - nodeScreenX;
    var deltaY = mouseY - nodeScreenY;
    
    // Convert screen distance to graph distance
    var zoom = cy.zoom();
    var newWidth = Math.max(50, Math.abs(deltaX) * 2 / zoom); // Minimum width of 50
    var newHeight = Math.max(50, Math.abs(deltaY) * 2 / zoom); // Minimum height of 50
    
    // Update node size
    nodeBeingResized.style('width', newWidth);
    nodeBeingResized.style('height', newHeight);
}

// Function to create context menu for edges
function createEdgeContextMenu(x, y, edge) {
    // Remove existing context menu if any
    removeContextMenu();
    
    selectedEdge = edge;
    
    // Create context menu container
    contextMenu = document.createElement('div');
    contextMenu.style.position = 'absolute';
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.style.backgroundColor = '#ffffff';
    contextMenu.style.border = '1px solid #ccc';
    contextMenu.style.borderRadius = '4px';
    contextMenu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    contextMenu.style.zIndex = '1001';
    contextMenu.style.minWidth = '150px';
    contextMenu.style.padding = '4px 0';
    
    // Create menu items
    var menuItems = [
        { label: 'Delete', action: function() { deleteEdge(edge); } }
    ];
    
    menuItems.forEach(function(item) {
        var menuItem = document.createElement('div');
        menuItem.textContent = item.label;
        menuItem.style.padding = '8px 16px';
        menuItem.style.cursor = 'pointer';
        menuItem.style.fontSize = '14px';
        menuItem.style.color = '#333';
        
        menuItem.addEventListener('mouseenter', function() {
            menuItem.style.backgroundColor = '#f0f0f0';
        });
        menuItem.addEventListener('mouseleave', function() {
            menuItem.style.backgroundColor = 'transparent';
        });
        
        menuItem.addEventListener('click', function() {
            item.action();
            removeContextMenu();
        });
        
        contextMenu.appendChild(menuItem);
    });
    
    document.body.appendChild(contextMenu);
}

// Function to start linking mode
function startLinking(node) {
    // Cancel any existing linking mode
    cancelLinking();
    
    // Set linking mode
    linkingMode = true;
    sourceNodeForLink = node;
    
    // Add visual indicator to source node
    node.addClass('linking-source');
    
    // Change cursor to indicate linking mode
    container.style.cursor = 'crosshair';
}

// Function to cancel linking mode
function cancelLinking() {
    if (sourceNodeForLink) {
        sourceNodeForLink.removeClass('linking-source');
    }
    linkingMode = false;
    sourceNodeForLink = null;
    container.style.cursor = '';
}

// Function to create edge between two nodes
function createEdge(sourceNode, targetNode) {
    // Don't create edge if source and target are the same
    if (sourceNode.id() === targetNode.id()) {
        return;
    }
    
    // Check if edge already exists
    var existingEdges = cy.edges().filter(function(edge) {
        return (edge.source().id() === sourceNode.id() && edge.target().id() === targetNode.id()) ||
               (edge.source().id() === targetNode.id() && edge.target().id() === sourceNode.id());
    });
    
    if (existingEdges.length > 0) {
        // Edge already exists, don't create duplicate
        return;
    }
    
    // Create new edge
    var edgeId = 'edge_' + (++edgeIdCounter);
    cy.add({
        data: {
            id: edgeId,
            source: sourceNode.id(),
            target: targetNode.id()
        }
    });
}

// Handle click on nodes (for linking mode)
cy.on('tap', 'node', function(evt) {
    if (linkingMode && sourceNodeForLink) {
        var targetNode = evt.target;
        
        // Don't create edge if clicking on the same node
        if (sourceNodeForLink.id() !== targetNode.id()) {
            createEdge(sourceNodeForLink, targetNode);
        }
        
        // Exit linking mode
        cancelLinking();
    }
    
    // If in resizing mode, clicking a node stops resizing
    if (resizingMode) {
        cancelResizing();
    }
});

// Handle click on canvas background (to cancel linking mode)
cy.on('tap', function(evt) {
    // If clicking on background (not on a node) and in linking mode, cancel it
    if (linkingMode && evt.target === cy) {
        cancelLinking();
    }
    // Cancel resizing if clicking on background
    if (resizingMode && evt.target === cy) {
        cancelResizing();
    }
});

// Handle right-click on edges
cy.on('cxttap', 'edge', function(evt) {
    isEdgeRightClick = true;
    
    // Get the original event to access mouse coordinates
    var originalEvent = evt.originalEvent || evt.cyEvent || evt;
    
    // Get click position from the original event
    var screenX = originalEvent.clientX || originalEvent.pageX;
    var screenY = originalEvent.clientY || originalEvent.pageY;
    
    // If we can't get coordinates from original event, use edge midpoint
    if (!screenX || !screenY) {
        var sourcePos = evt.target.source().renderedPosition();
        var targetPos = evt.target.target().renderedPosition();
        var midX = (sourcePos.x + targetPos.x) / 2;
        var midY = (sourcePos.y + targetPos.y) / 2;
        var containerRect = container.getBoundingClientRect();
        screenX = containerRect.left + midX;
        screenY = containerRect.top + midY;
    }
    
    // Create edge context menu
    createEdgeContextMenu(screenX, screenY, evt.target);
    
    // Reset flag after a short delay
    setTimeout(function() {
        isEdgeRightClick = false;
    }, 100);
});

// Handle right-click on nodes
cy.on('cxttap', 'node', function(evt) {
    isNodeRightClick = true;
    
    // Get the original event to access mouse coordinates
    var originalEvent = evt.originalEvent || evt.cyEvent || evt;
    
    // Get click position from the original event
    var screenX = originalEvent.clientX || originalEvent.pageX;
    var screenY = originalEvent.clientY || originalEvent.pageY;
    
    // If we can't get coordinates from original event, use node position
    if (!screenX || !screenY) {
        var nodePos = evt.target.renderedPosition();
        var containerRect = container.getBoundingClientRect();
        screenX = containerRect.left + nodePos.x;
        screenY = containerRect.top + nodePos.y;
    }
    
    // Create context menu
    createContextMenu(screenX, screenY, evt.target);
    
    // Reset flag after a short delay
    setTimeout(function() {
        isNodeRightClick = false;
    }, 100);
});

// Handle right-click on the canvas (only when not clicking on a node)
container.addEventListener('contextmenu', function(e) {
    // Cancel linking mode if active
    if (linkingMode) {
        cancelLinking();
    }
    // Cancel resizing mode if active
    if (resizingMode) {
        cancelResizing();
    }
    
    // Check if we clicked on a node or edge
    if (isNodeRightClick || isEdgeRightClick || contextMenu) {
        e.preventDefault(); // Prevent default context menu
        return; // Let the node/edge context menu handle it
    }
    
    e.preventDefault(); // Prevent default context menu
    
    // Remove existing input box if any
    if (textInputBox) {
        textInputBox.remove();
        textInputBox = null;
    }
    
    // Store click position (screen coordinates)
    clickPosition = { x: e.clientX, y: e.clientY };
    
    // Convert to graph coordinates
    graphPosition = screenToGraph(e.clientX, e.clientY);
    
    // Create input text box at mouse position
    textInputBox = document.createElement('input');
    textInputBox.type = 'text';
    textInputBox.style.position = 'absolute';
    textInputBox.style.left = clickPosition.x + 'px';
    textInputBox.style.top = clickPosition.y + 'px';
    textInputBox.style.transform = 'translate(-50%, -50%)';
    textInputBox.style.padding = '8px 12px';
    textInputBox.style.fontSize = '14px';
    textInputBox.style.border = '2px solid #3498db';
    textInputBox.style.borderRadius = '5px';
    textInputBox.style.zIndex = '1000';
    textInputBox.style.outline = 'none';
    textInputBox.style.backgroundColor = '#ffffff';
    textInputBox.value = '';
    
    document.body.appendChild(textInputBox);
    textInputBox.focus();
    
    // Handle Enter key to create circle or close if empty
    textInputBox.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            var newLabel = textInputBox.value.trim();
            
            if (newLabel && textInputBox) {
                // Get the textbox's current position on screen
                var textboxRect = textInputBox.getBoundingClientRect();
                var textboxCenterX = textboxRect.left + textboxRect.width / 2;
                var textboxCenterY = textboxRect.top + textboxRect.height / 2;
                
                // Convert textbox position to graph coordinates
                var textboxGraphPosition = screenToGraph(textboxCenterX, textboxCenterY);
                
                // Create new box node at the textbox position
                var nodeId = 'node_' + (++nodeIdCounter);
                var newNode = cy.add({
                    data: { id: nodeId, label: newLabel },
                    //renderedPosition: { x: textboxGraphPosition.x, y: textboxGraphPosition.y },
                    positions: { x: textboxGraphPosition.x, y: textboxGraphPosition.y },
                    locked: false
                });
                
                // Force position update (in case layout tries to move it)
                //newNode.position({ x: textboxGraphPosition.x, y: textboxGraphPosition.y });
            }
            
            // Remove input box
            textInputBox.remove();
            textInputBox = null;
            clickPosition = null;
            graphPosition = null;
        } else if (e.key === 'Escape') {
            // Cancel on Escape
            textInputBox.remove();
            textInputBox = null;
            clickPosition = null;
            graphPosition = null;
        }
    });
    
    // Close on blur (click outside)
    textInputBox.addEventListener('blur', function() {
        setTimeout(function() {
            if (textInputBox) {
                textInputBox.remove();
                textInputBox = null;
                clickPosition = null;
                graphPosition = null;
            }
        }, 200);
    });
});

// Close context menu when clicking elsewhere
document.addEventListener('click', function(e) {
    if (contextMenu && !contextMenu.contains(e.target)) {
        removeContextMenu();
    }
});

// Handle mouse move for resizing
container.addEventListener('mousemove', function(e) {
    if (resizingMode && nodeBeingResized) {
        resizeNode(e.clientX, e.clientY);
    }
});

// Close context menu on Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        if (contextMenu) {
            removeContextMenu();
        }
        if (linkingMode) {
            cancelLinking();
        }
        if (resizingMode) {
            cancelResizing();
        }
    }
});

