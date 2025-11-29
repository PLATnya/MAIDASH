
var cy = cytoscape({
    container: document.getElementById('cy'),
    
    elements: [],
    
    style: [{
        selector: 'node',
        style: {
            'width': 300,
            'height': 100,
            'shape': 'rectangle',
            'background-color': 'grey',
            'border-width': 2,
            'border-color': 'black',
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
            'target-arrow-shape': 'none',
            'label': 'data(label)',
            'font-size': '12px',
            'text-rotation': 'autorotate',
            'text-margin-y': -10,
            'color': '#333',
            'text-outline-width': 2,
            'text-outline-color': '#ffffff'
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
    }, {
        selector: 'node.selected',
        style: {
            'border-color': '#f39c12',
            'border-width': 4,
            'background-color': '#f1c40f',
            'border-opacity': 1
        }
    }, {
        selector: 'node.uneditable',
        style: {
            'background-color': '#95a5a6',
            'border-color': '#7f8c8d',
            'opacity': 0.8
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
var commandInputBox = null;
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
    // Get coordinates relative to container (rendered coordinates)
    var renderedX = screenX - containerRect.left;
    var renderedY = screenY - containerRect.top;
    
    return {
        x: (renderedX),
        y: (renderedY)
    };
}

// Function to style input box
function styleInputBox(inputBox) {
    inputBox.style.position = 'absolute';
    inputBox.style.padding = '12px 16px';
    inputBox.style.fontSize = '15px';
    inputBox.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    inputBox.style.border = '2px solid #3498db';
    inputBox.style.borderRadius = '8px';
    inputBox.style.zIndex = '1000';
    inputBox.style.outline = 'none';
    inputBox.style.backgroundColor = '#ffffff';
    inputBox.style.color = '#2c3e50';
    inputBox.style.boxShadow = '0 4px 12px rgba(52, 152, 219, 0.3), 0 2px 4px rgba(0, 0, 0, 0.1)';
    inputBox.style.transition = 'all 0.2s ease';
    inputBox.style.minWidth = '200px';
    inputBox.style.maxWidth = '400px';
    
    // Store base transform (should be set before calling this function)
    var baseTransform = inputBox.style.transform || 'translate(-50%, -50%)';
    inputBox.dataset.baseTransform = baseTransform;
    
    // Add focus styles
    inputBox.addEventListener('focus', function() {
        this.style.borderColor = '#2980b9';
        this.style.boxShadow = '0 6px 16px rgba(52, 152, 219, 0.4), 0 2px 6px rgba(0, 0, 0, 0.15)';
        var base = this.dataset.baseTransform || 'translate(-50%, -50%)';
        this.style.transform = base + ' scale(1.02)';
    });
    
    inputBox.addEventListener('blur', function() {
        this.style.borderColor = '#3498db';
        this.style.boxShadow = '0 4px 12px rgba(52, 152, 219, 0.3), 0 2px 4px rgba(0, 0, 0, 0.1)';
        var base = this.dataset.baseTransform || 'translate(-50%, -50%)';
        this.style.transform = base;
    });
}

// Function to style command input box (wide version)
function styleCommandInputBox(inputBox) {
    inputBox.style.position = 'absolute';
    inputBox.style.padding = '12px 16px';
    inputBox.style.fontSize = '15px';
    inputBox.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    inputBox.style.border = '2px solid #9b59b6';
    inputBox.style.borderRadius = '8px';
    inputBox.style.zIndex = '1000';
    inputBox.style.outline = 'none';
    inputBox.style.backgroundColor = '#ffffff';
    inputBox.style.color = '#2c3e50';
    inputBox.style.boxShadow = '0 4px 12px rgba(155, 89, 182, 0.3), 0 2px 4px rgba(0, 0, 0, 0.1)';
    inputBox.style.transition = 'all 0.2s ease';
    inputBox.style.minWidth = '500px';
    inputBox.style.maxWidth = '800px';
    inputBox.style.width = '600px';
    inputBox.setAttribute('placeholder', 'Type command (e.g., /load)');
    
    // Store base transform (should be set before calling this function)
    var baseTransform = inputBox.style.transform || 'translate(-50%, -50%)';
    inputBox.dataset.baseTransform = baseTransform;
    
    // Add focus styles
    inputBox.addEventListener('focus', function() {
        this.style.borderColor = '#8e44ad';
        this.style.boxShadow = '0 6px 16px rgba(155, 89, 182, 0.4), 0 2px 6px rgba(0, 0, 0, 0.15)';
        var base = this.dataset.baseTransform || 'translate(-50%, -50%)';
        this.style.transform = base + ' scale(1.02)';
    });
    
    inputBox.addEventListener('blur', function() {
        this.style.borderColor = '#9b59b6';
        this.style.boxShadow = '0 4px 12px rgba(155, 89, 182, 0.3), 0 2px 4px rgba(0, 0, 0, 0.1)';
        var base = this.dataset.baseTransform || 'translate(-50%, -50%)';
        this.style.transform = base;
    });
}

// Function to handle commands
function handleCommand(command) {
    command = command.trim();
    
    if (command === '/load') {
        // Create a hidden file input element
        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.style.display = 'none';
        fileInput.accept = '*/*'; // Accept all file types, or specify like '.txt,.pdf,.docx'
        
        fileInput.addEventListener('change', function(e) {
            var file = e.target.files[0];
            if (file) {
                uploadFileToDB(file);
            }
            // Clean up
            document.body.removeChild(fileInput);
        });
        
        document.body.appendChild(fileInput);
        fileInput.click();
    } else if (command.startsWith('/')) {
        console.log('Unknown command:', command);
        alert('Unknown command: ' + command);
    }
}

// Function to create an uneditable file node
function createFileNode(fileName, position, actualFileName) {
    var nodeId = 'file_' + (++nodeIdCounter);
    
    // If no position provided, use center of viewport
    var nodePosition;
    if (position && position.x !== undefined && position.y !== undefined) {
        nodePosition = position;
    } else {
        // Get center of viewport in graph coordinates
        var containerRect = container.getBoundingClientRect();
        var centerScreenX = containerRect.left + containerRect.width / 2;
        var centerScreenY = containerRect.top + containerRect.height / 2;
        
        // Convert screen coordinates to graph coordinates
        var graphPos = screenToGraph(centerScreenX, centerScreenY);
        nodePosition = graphPos;
    }
    
    // Use actualFileName if provided (for renamed files), otherwise use fileName
    var storedFileName = actualFileName || fileName;
    
    // Create node with uneditable class
    var newNode = cy.add({
        data: { 
            id: nodeId, 
            label: fileName, // Display name (original)
            fileName: storedFileName, // Actual filename on disk
            editable: false,
            type: 'file'
        },
        renderedPosition: { x: nodePosition.x, y: nodePosition.y },
        classes: 'uneditable'
    });
    
    return newNode;
}

// Function to get linked nodes for a given node
function getLinkedNodes(node) {
    var linkedNodes = [];
    
    // Get all edges connected to this node
    var connectedEdges = node.connectedEdges();
    
    connectedEdges.forEach(function(edge) {
        var sourceNode = edge.source();
        var targetNode = edge.target();
        var linkageLabel = edge.data('label') || '';
        
        // Determine which node is the linked one (not the current node)
        var linkedNode;
        if (sourceNode.id() === node.id()) {
            linkedNode = targetNode;
        } else {
            linkedNode = sourceNode;
        }
        
        linkedNodes.push({
            node_id: linkedNode.id(),
            linkage_label: linkageLabel
        });
    });
    
    return linkedNodes;
}

// Function to send text node info to API
function saveTextNodeToAPI(nodeId, label, linkedNodes) {
    var payload = {
        node_id: nodeId,
        label: label,
        linked_nodes: linkedNodes
    };
    
    fetch('/api/text-node', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
    .then(function(response) {
        if (!response.ok) {
            throw new Error('Failed to save text node: ' + response.statusText);
        }
        return response.json();
    })
    .then(function(data) {
        console.log('Text node saved successfully:', data);
    })
    .catch(function(error) {
        console.error('Error saving text node:', error);
    });
}

// Function to upload file to database
function uploadFileToDB(file) {
    var formData = new FormData();
    formData.append('file', file);
    
    fetch('/api/upload', {
        method: 'POST',
        body: formData
    })
    .then(function(response) {
        if (!response.ok) {
            throw new Error('Upload failed: ' + response.statusText);
        }
        return response.json();
    })
    .then(function(data) {
        console.log('File uploaded successfully:', data);
        
        // Create uneditable node with file name
        // Use the actual filename returned from server (may have suffix if renamed)
        var actualFileName = data.filename || file.name;
        var fileNode = createFileNode(file.name, null, actualFileName);
        
        // Optionally focus on the new node
        setTimeout(function() {
            focusOnNode(fileNode);
        }, 100);
        
        alert('File "' + file.name + '" uploaded successfully!');
    })
    .catch(function(error) {
        console.error('Error uploading file:', error);
        alert('Error uploading file: ' + error.message);
    });
}

// Function to deselect all nodes
function deselectAllNodes() {
    cy.nodes().removeClass('selected');
    selectedNode = null;
}

// Function to select a node
function selectNode(node) {
    // Deselect all nodes first
    deselectAllNodes();
    // Select the new node
    node.addClass('selected');
    selectedNode = node;
}

// Function to focus on a node (zoom and pan to center it)
function focusOnNode(node) {
    if (!node) return;
    
    // Animate to center the node in the viewport
    cy.animate({
        center: { eles: node },
        zoom: Math.max(cy.zoom(), 1.5), // Zoom in, but at least 1.5x
        duration: 300
    });
}

// Function to remove context menu
function removeContextMenu() {
    if (contextMenu) {
        contextMenu.remove();
        contextMenu = null;
        // Don't deselect nodes when closing context menu
        // selectedNode = null;
        selectedEdge = null;
        isNodeRightClick = false;
        isEdgeRightClick = false;
    }
}

// Function to create context menu
function createContextMenu(x, y, node) {
    // Remove existing context menu if any
    removeContextMenu();
    
    // Select the node when showing context menu
    selectNode(node);
    
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
    
    // Create menu items (conditionally show Edit for editable nodes)
    var menuItems = [];
    
    // Only show Edit option if node is editable
    if (node.data('editable') !== false && !node.hasClass('uneditable')) {
        menuItems.push({ label: 'Edit', action: function() { editNode(node); } });
    }
    
    menuItems.push(
        { label: 'Resize', action: function() { startResizing(node, 0, 0); } },
        { label: 'Link', action: function() { startLinking(node); } },
        { label: 'Delete', action: function() { deleteNode(node); } }
    );
    
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
    // Check if node is editable
    if (node.data('editable') === false || node.hasClass('uneditable')) {
        alert('This node cannot be edited.');
        return;
    }
    
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
    textInputBox.style.left = screenX + 'px';
    textInputBox.style.top = screenY + 'px';
    textInputBox.style.transform = 'translate(-50%, -50%)';
    textInputBox.value = currentLabel;
    styleInputBox(textInputBox);
    
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
    // Check if it's a file node and delete the file from storage
    if (node.data('type') === 'file') {
        var fileName = node.data('fileName') || node.data('label');
        
        // Delete file from backend
        fetch('/api/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ filename: fileName })
        })
        .then(function(response) {
            if (!response.ok) {
                console.warn('Failed to delete file from storage:', fileName);
                // Continue with node deletion even if file deletion fails
            }
            return response.json();
        })
        .then(function(data) {
            console.log('File deleted from storage:', fileName);
        })
        .catch(function(error) {
            console.error('Error deleting file from storage:', error);
            // Continue with node deletion even if file deletion fails
        });
    }
    
    // Remove the node from the graph
    cy.remove(node);
}

// Function to edit edge
function editEdge(edge) {
    var currentLabel = edge.data('label') || '';
    
    // Remove existing input box if any
    if (textInputBox) {
        textInputBox.remove();
        textInputBox = null;
    }
    
    // Get edge midpoint position on screen
    var sourcePos = edge.source().renderedPosition();
    var targetPos = edge.target().renderedPosition();
    var midX = (sourcePos.x + targetPos.x) / 2;
    var midY = (sourcePos.y + targetPos.y) / 2;
    var containerRect = container.getBoundingClientRect();
    var screenX = containerRect.left + midX;
    var screenY = containerRect.top + midY;
    
    // Create input text box at edge midpoint
    textInputBox = document.createElement('input');
    textInputBox.type = 'text';
    textInputBox.style.left = screenX + 'px';
    textInputBox.style.top = screenY + 'px';
    textInputBox.style.transform = 'translate(-50%, -50%)';
    textInputBox.value = currentLabel;
    styleInputBox(textInputBox);
    
    document.body.appendChild(textInputBox);
    textInputBox.focus();
    textInputBox.select();
    
    // Handle Enter key to update edge label
    textInputBox.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            var newLabel = textInputBox.value.trim();
            // Allow empty labels for edges
            edge.data('label', newLabel);
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
        { label: 'Edit', action: function() { editEdge(edge); } },
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
            target: targetNode.id(),
            label: '' // Initialize with empty label
        }
    });
}

// Handle click on nodes (for linking mode and selection)
cy.on('tap', 'node', function(evt) {
    var clickedNode = evt.target;
    
    if (linkingMode && sourceNodeForLink) {
        // Don't create edge if clicking on the same node
        if (sourceNodeForLink.id() !== clickedNode.id()) {
            createEdge(sourceNodeForLink, clickedNode);
        }
        
        // Exit linking mode
        cancelLinking();
    }
    
    // If in resizing mode, clicking a node stops resizing
    if (resizingMode) {
        cancelResizing();
    }
    
    // Select the clicked node (unless we're in linking mode)
    if (!linkingMode) {
        selectNode(clickedNode);
    }
});

// Handle double-click on nodes (focus/zoom to node)
cy.on('dbltap', 'node', function(evt) {
    var clickedNode = evt.target;
    
    // Select the node first
    selectNode(clickedNode);
    
    // Focus on the node (zoom and center)
    focusOnNode(clickedNode);
});

// Handle click on canvas background (to cancel linking mode and deselect nodes)
cy.on('tap', function(evt) {
    // Only handle if clicking on background (not on a node or edge)
    if (evt.target === cy) {
        // Check if it's a right-click by examining the original event
        var originalEvent = evt.originalEvent || evt.cyEvent;
        var isRightClick = false;
        
        if (originalEvent) {
            // Check mouse button (0 = left, 2 = right)
            if (originalEvent.button !== undefined && originalEvent.button === 2) {
                isRightClick = true;
            }
            // Also check if it's a context menu event
            if (originalEvent.type === 'contextmenu') {
                isRightClick = true;
            }
        }
        
        // If clicking on background (not on a node) and in linking mode, cancel it
        if (linkingMode) {
            cancelLinking();
        }
        // Cancel resizing if clicking on background
        if (resizingMode) {
            cancelResizing();
        }
        // Deselect nodes when clicking on background
        deselectAllNodes();
        
        // Show command input box on left click only (not right click)
        if (!isRightClick && !contextMenu) {
            // Get click position
            var screenX = originalEvent ? (originalEvent.clientX || originalEvent.pageX || 0) : 0;
            var screenY = originalEvent ? (originalEvent.clientY || originalEvent.pageY || 0) : 0;
            
            // Use center of viewport if coordinates not available
            if (!screenX || !screenY) {
                var containerRect = container.getBoundingClientRect();
                screenX = containerRect.left + containerRect.width / 2;
                screenY = containerRect.top + containerRect.height / 2;
            }
            
            // Remove existing command input box if any
            if (commandInputBox) {
                commandInputBox.remove();
                commandInputBox = null;
            }
            
            // Remove existing text input box if any
            if (textInputBox) {
                textInputBox.remove();
                textInputBox = null;
            }
            
            // Create command input box
            commandInputBox = document.createElement('input');
            commandInputBox.type = 'text';
            commandInputBox.placeholder = 'Type command (e.g., /load)';
            commandInputBox.style.left = screenX + 'px';
            commandInputBox.style.top = screenY + 'px';
            commandInputBox.style.transform = 'translate(-50%, -50%)';
            styleCommandInputBox(commandInputBox);
            
            document.body.appendChild(commandInputBox);
            commandInputBox.focus();
            
            // Handle Enter key to execute command
            commandInputBox.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    var command = commandInputBox.value.trim();
                    if (command) {
                        handleCommand(command);
                    }
                    commandInputBox.remove();
                    commandInputBox = null;
                } else if (e.key === 'Escape') {
                    commandInputBox.remove();
                    commandInputBox = null;
                }
            });
            
            // Close on blur
            commandInputBox.addEventListener('blur', function() {
                setTimeout(function() {
                    if (commandInputBox) {
                        commandInputBox.remove();
                        commandInputBox = null;
                    }
                }, 200);
            });
        }
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

// Handle right-click on canvas background using Cytoscape's cxttap event
cy.on('cxttap', function(evt) {
    // Only handle if clicking on background (not on a node or edge)
    if (evt.target === cy) {
        // Cancel linking mode if active
        if (linkingMode) {
            cancelLinking();
        }
        // Cancel resizing mode if active
        if (resizingMode) {
            cancelResizing();
        }
        
        // Get the original event to access mouse coordinates for input box positioning
        var originalEvent = evt.originalEvent || evt.cyEvent || evt;
        var screenX = originalEvent.clientX || originalEvent.pageX;
        var screenY = originalEvent.clientY || originalEvent.pageY;
        
        // Store click position (screen coordinates) for input box
        clickPosition = { x: screenX, y: screenY };

        graphPosition = screenToGraph(screenX, screenY);
        
        // Remove existing input box if any
        if (textInputBox) {
            textInputBox.remove();
            textInputBox = null;
        }
        
        // Create input text box at mouse position
        textInputBox = document.createElement('input');
        textInputBox.type = 'text';
        textInputBox.style.left = clickPosition.x + 'px';
        textInputBox.style.top = clickPosition.y + 'px';
        textInputBox.style.transform = 'translate(-50%, -50%)';
        textInputBox.value = '';
        styleInputBox(textInputBox);
        
        document.body.appendChild(textInputBox);
        textInputBox.focus();
        
        // Handle Enter key to create node or close if empty
        textInputBox.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                var newLabel = textInputBox.value.trim();
                
                if (newLabel && textInputBox && graphPosition) {
                    // Create new box node at the last mouse position (where user right-clicked)
                    var nodeId = 'node_' + (++nodeIdCounter);
                    var newNode = cy.add({
                        data: { 
                            id: nodeId, 
                            label: newLabel,
                            editable: true
                        },
                        renderedPosition: { x: graphPosition.x, y: graphPosition.y }
                    });
                    
                    // Get linked nodes and send to API
                    // Use setTimeout to ensure the node is fully added to the graph first
                    setTimeout(function() {
                        var linkedNodes = getLinkedNodes(newNode);
                        saveTextNodeToAPI(nodeId, newLabel, linkedNodes);
                    }, 100);
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
    }
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
    
    // Note: The actual node creation is now handled by Cytoscape's cxttap event above
    // This handler is kept for preventing default context menu
});

// Handle mouse move for resizing
container.addEventListener('mousemove', function(e) {
    if (resizingMode && nodeBeingResized) {
        resizeNode(e.clientX, e.clientY);
    }
});

// Close context menu when clicking elsewhere
document.addEventListener('click', function(e) {
    if (contextMenu && !contextMenu.contains(e.target)) {
        removeContextMenu();
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

