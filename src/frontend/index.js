
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
        selector: 'node[color]',
        style: {
            'background-color': 'data(color)'
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

// Store node_id label elements
var nodeIdLabels = {};

// Function to update node_id label position
function updateNodeIdLabel(node) {
    var nodeId = node.id();
    var nodePos = node.renderedPosition();
    var containerRect = container.getBoundingClientRect();
    var nodeHeight = node.height();
    var zoom = cy.zoom();
    
    // Calculate position above the node (nodePos is in rendered coordinates)
    var screenX = containerRect.left + nodePos.x;
    var screenY = containerRect.top + nodePos.y - (nodeHeight / 2 + 15);
    
    // Get or create label element
    var labelElement = nodeIdLabels[nodeId];
    if (!labelElement) {
        labelElement = document.createElement('div');
        labelElement.className = 'node-id-label';
        labelElement.style.position = 'absolute';
        labelElement.style.pointerEvents = 'none';
        labelElement.style.zIndex = '1000';
        labelElement.style.fontSize = '11px';
        labelElement.style.fontWeight = 'normal';
        labelElement.style.color = '#666666';
        labelElement.style.textAlign = 'center';
        labelElement.style.whiteSpace = 'nowrap';
        labelElement.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        labelElement.style.padding = '2px 6px';
        labelElement.style.borderRadius = '4px';
        labelElement.style.transform = 'translate(-50%, -100%)';
        labelElement.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        labelElement.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.2)';
        container.appendChild(labelElement);
        nodeIdLabels[nodeId] = labelElement;
    }
    
    // Update text and position
    labelElement.textContent = nodeId;
    labelElement.style.left = screenX + 'px';
    labelElement.style.top = screenY + 'px';
}

// Function to remove node_id label
function removeNodeIdLabel(nodeId) {
    var labelElement = nodeIdLabels[nodeId];
    if (labelElement) {
        labelElement.remove();
        delete nodeIdLabels[nodeId];
    }
}

// Function to update all node_id labels
function updateAllNodeIdLabels() {
    cy.nodes().forEach(function(node) {
        updateNodeIdLabel(node);
    });
}

// Function to style input box
function styleInputBox(inputBox) {
    inputBox.style.position = 'absolute';
    inputBox.style.padding = '16px 20px';
    inputBox.style.fontSize = '16px';
    inputBox.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    inputBox.style.border = '2px solid #3498db';
    inputBox.style.borderRadius = '12px';
    inputBox.style.zIndex = '1000';
    inputBox.style.outline = 'none';
    inputBox.style.backgroundColor = '#ffffff';
    inputBox.style.color = '#2c3e50';
    inputBox.style.boxShadow = '0 8px 24px rgba(52, 152, 219, 0.25), 0 4px 8px rgba(0, 0, 0, 0.1)';
    inputBox.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    inputBox.style.minWidth = '400px';
    inputBox.style.width = '500px';
    inputBox.style.maxWidth = '700px';
    inputBox.setAttribute('placeholder', 'Type node label or command (e.g., /load, /ask, /search)');
    
    // Store base transform (should be set before calling this function)
    var baseTransform = inputBox.style.transform || 'translate(-50%, -50%)';
    inputBox.dataset.baseTransform = baseTransform;
    
    // Add focus styles
    inputBox.addEventListener('focus', function() {
        this.style.borderColor = '#2980b9';
        this.style.boxShadow = '0 12px 32px rgba(52, 152, 219, 0.35), 0 6px 12px rgba(0, 0, 0, 0.15)';
        this.style.backgroundColor = '#f8f9fa';
        var base = this.dataset.baseTransform || 'translate(-50%, -50%)';
        this.style.transform = base + ' scale(1.02)';
    });
    
    inputBox.addEventListener('blur', function() {
        this.style.borderColor = '#3498db';
        this.style.boxShadow = '0 8px 24px rgba(52, 152, 219, 0.25), 0 4px 8px rgba(0, 0, 0, 0.1)';
        this.style.backgroundColor = '#ffffff';
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
    } else if (command.startsWith('/ask ')) {
        var query = command.substring(5).trim(); // Remove '/ask ' prefix
        if (query) {
            askQuestion(query);
        } else {
            alert('Please provide a question after /ask');
        }
    } else if (command.startsWith('/search ')) {
        var query = command.substring(8).trim(); // Remove '/search ' prefix
        if (query) {
            performSearch(query);
        } else {
            alert('Please provide a search query after /search');
        }
    } else if (command.startsWith('/')) {
        console.log('Unknown command:', command);
        alert('Unknown command: ' + command);
    }
}

// Function to ask a question and display response
function askQuestion(query) {
    // Create a modal to display the response
    var modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modal.style.zIndex = '2000';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    
    var modalContent = document.createElement('div');
    modalContent.style.backgroundColor = '#ffffff';
    modalContent.style.borderRadius = '12px';
    modalContent.style.padding = '24px';
    modalContent.style.maxWidth = '800px';
    modalContent.style.width = '90%';
    modalContent.style.maxHeight = '80vh';
    modalContent.style.overflow = 'auto';
    modalContent.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.3)';
    
    var title = document.createElement('h2');
    title.textContent = 'Question: ' + query;
    title.style.marginTop = '0';
    title.style.marginBottom = '16px';
    title.style.color = '#2c3e50';
    title.style.fontSize = '20px';
    
    var answerDiv = document.createElement('div');
    answerDiv.id = 'answer-content';
    answerDiv.style.marginTop = '16px';
    answerDiv.style.padding = '16px';
    answerDiv.style.backgroundColor = '#f8f9fa';
    answerDiv.style.borderRadius = '8px';
    answerDiv.style.minHeight = '100px';
    answerDiv.style.color = '#2c3e50';
    answerDiv.style.fontSize = '16px';
    answerDiv.style.lineHeight = '1.6';
    answerDiv.textContent = 'Thinking...';
    
    var buttonsContainer = document.createElement('div');
    buttonsContainer.style.display = 'flex';
    buttonsContainer.style.gap = '10px';
    buttonsContainer.style.marginTop = '16px';
    buttonsContainer.style.justifyContent = 'flex-end';
    
    var createNodeButton = document.createElement('button');
    createNodeButton.textContent = 'Create Node';
    createNodeButton.style.padding = '10px 20px';
    createNodeButton.style.backgroundColor = '#95a5a6';
    createNodeButton.style.color = '#ffffff';
    createNodeButton.style.border = 'none';
    createNodeButton.style.borderRadius = '6px';
    createNodeButton.style.cursor = 'not-allowed';
    createNodeButton.style.fontSize = '14px';
    createNodeButton.style.fontWeight = 'bold';
    createNodeButton.disabled = true;
    createNodeButton.style.opacity = '0.5';
    
    var closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.style.padding = '10px 20px';
    closeButton.style.backgroundColor = '#3498db';
    closeButton.style.color = '#ffffff';
    closeButton.style.border = 'none';
    closeButton.style.borderRadius = '6px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.fontSize = '14px';
    closeButton.style.fontWeight = 'bold';
    
    closeButton.addEventListener('click', function() {
        document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    buttonsContainer.appendChild(createNodeButton);
    buttonsContainer.appendChild(closeButton);
    
    modalContent.appendChild(title);
    modalContent.appendChild(answerDiv);
    modalContent.appendChild(buttonsContainer);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Send request to backend
    fetch(getApiUrl('api/ask'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: query })
    })
    .then(function(response) {
        if (!response.ok) {
            throw new Error('Failed to get answer: ' + response.statusText);
        }
        
        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var fullAnswer = '';
        var buffer = '';
        var responseCompleted = false;
        
        // Function to enable the create node button
        function enableCreateNodeButton() {
            createNodeButton.disabled = false;
            createNodeButton.style.backgroundColor = '#27ae60';
            createNodeButton.style.cursor = 'pointer';
            createNodeButton.style.opacity = '1';
        }
        
        // Function to create node with response text
        function createNodeFromResponse() {
            if (!fullAnswer.trim()) {
                alert('No response text to create node from');
                return;
            }
            
            // Get center of viewport in graph coordinates
            var containerRect = container.getBoundingClientRect();
            var centerScreenX = containerRect.left + containerRect.width / 2;
            var centerScreenY = containerRect.top + containerRect.height / 2;
            var graphPos = screenToGraph(centerScreenX, centerScreenY);
            
            // Create new node with response text
            var nodeId = 'node_' + (++nodeIdCounter);
            var newNode = cy.add({
                data: { 
                    id: nodeId, 
                    label: fullAnswer.trim(),
                    editable: true
                },
                renderedPosition: { x: graphPos.x, y: graphPos.y }
            });
            
            // Save node to API
            setTimeout(function() {
                var linkedNodes = getLinkedNodes(newNode);
                var color = newNode.data('color') || null;
                saveTextNodeToAPI(nodeId, fullAnswer.trim(), linkedNodes, color);
            }, 100);
            
            // Focus on the new node
            setTimeout(function() {
                focusOnNode(newNode);
            }, 100);
            
            // Close the modal
            document.body.removeChild(modal);
        }
        
        // Add click handler to create node button
        createNodeButton.addEventListener('click', function() {
            if (!createNodeButton.disabled) {
                createNodeFromResponse();
            }
        });
        
        function readStream() {
            reader.read().then(function(result) {
                if (result.done) {
                    // Process any remaining buffer
                    if (buffer.trim()) {
                        try {
                            var data = JSON.parse(buffer.trim());
                            if (data.type === 'token') {
                                fullAnswer += data.content;
                                answerDiv.textContent = fullAnswer;
                            } else if (data.type === 'done') {
                                answerDiv.textContent = data.answer || fullAnswer;
                                if (data.answer) {
                                    fullAnswer = data.answer;
                                }
                            }
                        } catch (e) {
                            console.error('Error parsing final buffer:', e);
                        }
                    }
                    // Enable create node button and show alert when response is fully done
                    if (!responseCompleted) {
                        responseCompleted = true;
                        enableCreateNodeButton();
                    }
                    return;
                }
                
                buffer += decoder.decode(result.value, { stream: true });
                var lines = buffer.split('\n');
                
                // Keep the last incomplete line in buffer
                buffer = lines.pop() || '';
                
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i].trim();
                    if (!line) continue;
                    
                    try {
                        var data = JSON.parse(line);
                        
                        if (data.type === 'token') {
                            fullAnswer += data.content;
                            answerDiv.textContent = fullAnswer;
                        } else if (data.type === 'sources') {
                            var sourcesText = '\n\nSources: ' + data.sources.join(', ');
                            answerDiv.textContent = fullAnswer + sourcesText;
                        } else if (data.type === 'done') {
                            answerDiv.textContent = data.answer || fullAnswer;
                            if (data.answer) {
                                fullAnswer = data.answer;
                            }
                            // Enable create node button and show alert when done message is received
                            if (!responseCompleted) {
                                responseCompleted = true;
                                enableCreateNodeButton();
                            }
                        } else if (data.type === 'error') {
                            answerDiv.textContent = 'Error: ' + data.message;
                            answerDiv.style.color = '#e74c3c';
                        }
                    } catch (e) {
                        console.error('Error parsing stream data:', e, 'Line:', line);
                    }
                }
                
                readStream();
            }).catch(function(error) {
                console.error('Stream error:', error);
                answerDiv.textContent = 'Error: ' + error.message;
                answerDiv.style.color = '#e74c3c';
            });
        }
        
        readStream();
    })
    .catch(function(error) {
        console.error('Error asking question:', error);
        answerDiv.textContent = 'Error: ' + error.message;
        answerDiv.style.color = '#e74c3c';
    });
}

// Function to perform web search and display results
function performSearch(query) {
    // Create a modal to display the search results
    var modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modal.style.zIndex = '2000';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    
    var modalContent = document.createElement('div');
    modalContent.style.backgroundColor = '#ffffff';
    modalContent.style.borderRadius = '12px';
    modalContent.style.padding = '24px';
    modalContent.style.maxWidth = '900px';
    modalContent.style.width = '90%';
    modalContent.style.maxHeight = '80vh';
    modalContent.style.overflow = 'auto';
    modalContent.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.3)';
    
    var title = document.createElement('h2');
    title.textContent = 'Search: ' + query;
    title.style.marginTop = '0';
    title.style.marginBottom = '16px';
    title.style.color = '#2c3e50';
    title.style.fontSize = '20px';
    
    var resultsDiv = document.createElement('div');
    resultsDiv.id = 'search-results-content';
    resultsDiv.style.marginTop = '16px';
    resultsDiv.style.color = '#2c3e50';
    resultsDiv.style.fontSize = '16px';
    resultsDiv.style.lineHeight = '1.6';
    resultsDiv.textContent = 'Searching...';
    
    var buttonsContainer = document.createElement('div');
    buttonsContainer.style.display = 'flex';
    buttonsContainer.style.gap = '10px';
    buttonsContainer.style.marginTop = '16px';
    buttonsContainer.style.justifyContent = 'flex-end';
    
    var closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.style.padding = '10px 20px';
    closeButton.style.backgroundColor = '#3498db';
    closeButton.style.color = '#ffffff';
    closeButton.style.border = 'none';
    closeButton.style.borderRadius = '6px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.fontSize = '14px';
    closeButton.style.fontWeight = 'bold';
    
    closeButton.addEventListener('click', function() {
        document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    buttonsContainer.appendChild(closeButton);
    
    modalContent.appendChild(title);
    modalContent.appendChild(resultsDiv);
    modalContent.appendChild(buttonsContainer);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Send request to backend
    fetch(getApiUrl('api/search'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: query })
    })
    .then(function(response) {
        if (!response.ok) {
            throw new Error('Failed to perform search: ' + response.statusText);
        }
        return response.json();
    })
    .then(function(data) {
        // Format and display results
        var html = '';
        
        // Display answer if available
        if (data.answer) {
            html += '<div style="margin-bottom: 20px; padding: 16px; background-color: #e8f5e9; border-radius: 8px; border-left: 4px solid #27ae60;">';
            html += '<strong style="color: #27ae60; font-size: 18px;">Answer:</strong>';
            html += '<p style="margin-top: 8px; margin-bottom: 0;">' + escapeHtml(data.answer) + '</p>';
            html += '</div>';
        }
        
        // Display search results
        if (data.results && data.results.length > 0) {
            html += '<div style="margin-top: 20px;">';
            html += '<strong style="font-size: 18px; color: #2c3e50;">Search Results (' + data.results.length + '):</strong>';
            html += '<div style="margin-top: 12px;">';
            
            data.results.forEach(function(result, index) {
                html += '<div style="margin-bottom: 20px; padding: 16px; background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid #3498db;">';
                
                // Title with link
                if (result.url) {
                    html += '<h3 style="margin-top: 0; margin-bottom: 8px;">';
                    html += '<a href="' + escapeHtml(result.url) + '" target="_blank" style="color: #3498db; text-decoration: none; font-size: 16px;">';
                    html += escapeHtml(result.title || 'No title');
                    html += '</a>';
                    html += '</h3>';
                } else {
                    html += '<h3 style="margin-top: 0; margin-bottom: 8px; color: #2c3e50; font-size: 16px;">';
                    html += escapeHtml(result.title || 'No title');
                    html += '</h3>';
                }
                
                // Content
                if (result.content) {
                    html += '<p style="margin-top: 8px; margin-bottom: 8px; color: #555;">';
                    html += escapeHtml(result.content.length > 300 ? result.content.substring(0, 300) + '...' : result.content);
                    html += '</p>';
                }
                
                // URL
                if (result.url) {
                    html += '<a href="' + escapeHtml(result.url) + '" target="_blank" style="color: #7f8c8d; font-size: 12px; text-decoration: none;">';
                    html += escapeHtml(result.url);
                    html += '</a>';
                }
                
                html += '</div>';
            });
            
            html += '</div>';
            html += '</div>';
        } else {
            html += '<p style="color: #7f8c8d; font-style: italic;">No results found.</p>';
        }
        
        resultsDiv.innerHTML = html;
    })
    .catch(function(error) {
        console.error('Error performing search:', error);
        resultsDiv.innerHTML = '<p style="color: #e74c3c;">Error: ' + escapeHtml(error.message) + '</p>';
    });
}

// Helper function to escape HTML
function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Function to create an uneditable file node
function createFileNode(fileName, position, actualFileName) {
    var nodeId = 'node_' + (++nodeIdCounter);
    
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
    
    // Save file node info to API
    setTimeout(function() {
        var linkedNodes = getLinkedNodes(newNode);
        var color = newNode.data('color') || null;
        saveFileNodeToAPI(nodeId, fileName, linkedNodes, storedFileName, color);
    }, 100);
    
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

// Function to check if a node is a text node (not a file node)
function isTextNode(node) {
    return node.data('type') !== 'file' && node.data('editable') !== false;
}

// Function to check if a node is a file node
function isFileNode(node) {
    return node.data('type') === 'file';
}

// Function to send text node info to API (create)
function saveTextNodeToAPI(nodeId, label, linkedNodes, color) {
    var payload = {
        node_id: nodeId,
        label: label,
        linked_nodes: linkedNodes
    };
    if (color) {
        payload.color = color;
    }
    
    fetch(getApiUrl('api/text-node'), {
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

// Function to update text node info in API
function updateTextNodeInAPI(nodeId, label, linkedNodes, color) {
    var payload = {
        node_id: nodeId,
        label: label,
        linked_nodes: linkedNodes
    };
    if (color) {
        payload.color = color;
    }
    
    fetch(getApiUrl('api/text-node'), {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
    .then(function(response) {
        if (!response.ok) {
            throw new Error('Failed to update text node: ' + response.statusText);
        }
        return response.json();
    })
    .then(function(data) {
        console.log('Text node updated successfully:', data);
    })
    .catch(function(error) {
        console.error('Error updating text node:', error);
    });
}

// Function to delete text node from API
function deleteTextNodeFromAPI(nodeId) {
    fetch(getApiUrl('api/text-node/' + encodeURIComponent(nodeId)), {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(function(response) {
        if (!response.ok) {
            throw new Error('Failed to delete text node: ' + response.statusText);
        }
        return response.json();
    })
    .then(function(data) {
        console.log('Text node deleted successfully:', data);
    })
    .catch(function(error) {
        console.error('Error deleting text node:', error);
    });
}

// Function to update text node info for a given node
function syncTextNodeToAPI(node) {
    if (!isTextNode(node)) {
        return; // Only sync text nodes, not file nodes
    }
    
    var nodeId = node.id();
    var label = node.data('label') || '';
    var linkedNodes = getLinkedNodes(node);
    var color = node.data('color') || null;
    
    updateTextNodeInAPI(nodeId, label, linkedNodes, color);
}

// Function to update text node info for multiple nodes
function syncTextNodesToAPI(nodes) {
    nodes.forEach(function(node) {
        syncTextNodeToAPI(node);
    });
}

// Function to send file node info to API (create)
function saveFileNodeToAPI(nodeId, label, linkedNodes, filename, color) {
    var payload = {
        node_id: nodeId,
        label: label,
        linked_nodes: linkedNodes,
        filename: filename
    };
    if (color) {
        payload.color = color;
    }
    
    fetch(getApiUrl('api/file-node'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
    .then(function(response) {
        if (!response.ok) {
            throw new Error('Failed to save file node: ' + response.statusText);
        }
        return response.json();
    })
    .then(function(data) {
        console.log('File node saved successfully:', data);
    })
    .catch(function(error) {
        console.error('Error saving file node:', error);
    });
}

// Function to update file node info in API
function updateFileNodeInAPI(nodeId, label, linkedNodes, filename, color) {
    var payload = {
        node_id: nodeId,
        label: label,
        linked_nodes: linkedNodes,
        filename: filename
    };
    if (color) {
        payload.color = color;
    }
    
    fetch(getApiUrl('api/file-node'), {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
    .then(function(response) {
        if (!response.ok) {
            throw new Error('Failed to update file node: ' + response.statusText);
        }
        return response.json();
    })
    .then(function(data) {
        console.log('File node updated successfully:', data);
    })
    .catch(function(error) {
        console.error('Error updating file node:', error);
    });
}

// Function to delete file node from API
function deleteFileNodeFromAPI(nodeId) {
    fetch(getApiUrl('api/file-node/' + encodeURIComponent(nodeId)), {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(function(response) {
        if (!response.ok) {
            throw new Error('Failed to delete file node: ' + response.statusText);
        }
        return response.json();
    })
    .then(function(data) {
        console.log('File node deleted successfully:', data);
    })
    .catch(function(error) {
        console.error('Error deleting file node:', error);
    });
}

// Function to update file node info for a given node
function syncFileNodeToAPI(node) {
    if (!isFileNode(node)) {
        return; // Only sync file nodes
    }
    
    var nodeId = node.id();
    var label = node.data('label') || '';
    var filename = node.data('fileName') || '';
    var linkedNodes = getLinkedNodes(node);
    var color = node.data('color') || null;
    
    updateFileNodeInAPI(nodeId, label, linkedNodes, filename, color);
}

// Function to update file node info for multiple nodes
function syncFileNodesToAPI(nodes) {
    nodes.forEach(function(node) {
        syncFileNodeToAPI(node);
    });
}

// Function to sync any node (text or file) to API
function syncNodeToAPI(node) {
    if (isTextNode(node)) {
        syncTextNodeToAPI(node);
    } else if (isFileNode(node)) {
        syncFileNodeToAPI(node);
    }
}

// Function to sync multiple nodes (text or file) to API
function syncNodesToAPI(nodes) {
    nodes.forEach(function(node) {
        syncNodeToAPI(node);
    });
}

// Function to upload file to database
function uploadFileToDB(file) {
    var formData = new FormData();
    formData.append('file', file);
    
    fetch(getApiUrl('api/upload'), {
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
        
        //alert('File "' + file.name + '" uploaded successfully!');
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
        { label: 'Change Color', action: function() { changeNodeColor(node); } },
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
                // Update node in API after label change
                syncNodeToAPI(node);
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

// Function to change node color
function changeNodeColor(node) {
    // Get current color or default to grey
    var currentColor = node.data('color') || 'grey';
    
    // Remove existing color picker if any
    var existingPicker = document.getElementById('color-picker-container');
    if (existingPicker) {
        existingPicker.remove();
    }
    
    // Create color picker container
    var colorPicker = document.createElement('div');
    colorPicker.id = 'color-picker-container';
    colorPicker.style.position = 'fixed';
    colorPicker.style.top = '50%';
    colorPicker.style.left = '50%';
    colorPicker.style.transform = 'translate(-50%, -50%)';
    colorPicker.style.backgroundColor = '#ffffff';
    colorPicker.style.border = '2px solid #3498db';
    colorPicker.style.borderRadius = '12px';
    colorPicker.style.padding = '24px';
    colorPicker.style.zIndex = '2000';
    colorPicker.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.3)';
    colorPicker.style.minWidth = '300px';
    
    // Title
    var title = document.createElement('h3');
    title.textContent = 'Change Node Color';
    title.style.marginTop = '0';
    title.style.marginBottom = '16px';
    title.style.color = '#2c3e50';
    title.style.fontSize = '18px';
    colorPicker.appendChild(title);
    
    // Color input
    var colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = currentColor === 'grey' ? '#808080' : currentColor;
    colorInput.style.width = '100%';
    colorInput.style.height = '50px';
    colorInput.style.border = '2px solid #ddd';
    colorInput.style.borderRadius = '8px';
    colorInput.style.cursor = 'pointer';
    colorInput.style.marginBottom = '16px';
    colorPicker.appendChild(colorInput);
    
    // Preview
    var preview = document.createElement('div');
    preview.style.width = '100%';
    preview.style.height = '40px';
    preview.style.borderRadius = '8px';
    preview.style.border = '2px solid #ddd';
    preview.style.marginBottom = '16px';
    preview.style.backgroundColor = colorInput.value;
    colorPicker.appendChild(preview);
    
    // Update preview when color changes
    colorInput.addEventListener('input', function() {
        preview.style.backgroundColor = colorInput.value;
    });
    
    // Preset colors
    var presetColors = [
        { name: 'Grey', value: '#808080' },
        { name: 'Blue', value: '#3498db' },
        { name: 'Green', value: '#27ae60' },
        { name: 'Red', value: '#e74c3c' },
        { name: 'Orange', value: '#f39c12' },
        { name: 'Purple', value: '#9b59b6' },
        { name: 'Yellow', value: '#f1c40f' },
        { name: 'Teal', value: '#1abc9c' }
    ];
    
    var presetContainer = document.createElement('div');
    presetContainer.style.display = 'grid';
    presetContainer.style.gridTemplateColumns = 'repeat(4, 1fr)';
    presetContainer.style.gap = '8px';
    presetContainer.style.marginBottom = '16px';
    
    presetColors.forEach(function(preset) {
        var presetBtn = document.createElement('button');
        presetBtn.style.width = '100%';
        presetBtn.style.height = '30px';
        presetBtn.style.backgroundColor = preset.value;
        presetBtn.style.border = '2px solid #ddd';
        presetBtn.style.borderRadius = '4px';
        presetBtn.style.cursor = 'pointer';
        presetBtn.title = preset.name;
        presetBtn.addEventListener('click', function() {
            colorInput.value = preset.value;
            preview.style.backgroundColor = preset.value;
        });
        presetBtn.addEventListener('mouseenter', function() {
            presetBtn.style.borderColor = '#3498db';
            presetBtn.style.transform = 'scale(1.05)';
        });
        presetBtn.addEventListener('mouseleave', function() {
            presetBtn.style.borderColor = '#ddd';
            presetBtn.style.transform = 'scale(1)';
        });
        presetContainer.appendChild(presetBtn);
    });
    
    colorPicker.appendChild(presetContainer);
    
    // Close on background click - create overlay first
    var overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.style.zIndex = '1999';
    overlay.addEventListener('click', function() {
        overlay.remove();
        colorPicker.remove();
    });
    
    // Buttons container
    var buttonsContainer = document.createElement('div');
    buttonsContainer.style.display = 'flex';
    buttonsContainer.style.gap = '8px';
    buttonsContainer.style.justifyContent = 'flex-end';
    
    // Cancel button
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.padding = '10px 20px';
    cancelBtn.style.backgroundColor = '#95a5a6';
    cancelBtn.style.color = '#ffffff';
    cancelBtn.style.border = 'none';
    cancelBtn.style.borderRadius = '6px';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.style.fontSize = '14px';
    cancelBtn.style.fontWeight = 'bold';
    cancelBtn.addEventListener('click', function() {
        overlay.remove();
        colorPicker.remove();
    });
    buttonsContainer.appendChild(cancelBtn);
    
    // Apply button
    var applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.style.padding = '10px 20px';
    applyBtn.style.backgroundColor = '#3498db';
    applyBtn.style.color = '#ffffff';
    applyBtn.style.border = 'none';
    applyBtn.style.borderRadius = '6px';
    applyBtn.style.cursor = 'pointer';
    applyBtn.style.fontSize = '14px';
    applyBtn.style.fontWeight = 'bold';
    applyBtn.addEventListener('click', function() {
        var newColor = colorInput.value;
        node.data('color', newColor);
        // Update node in API
        syncNodeToAPI(node);
        overlay.remove();
        colorPicker.remove();
    });
    buttonsContainer.appendChild(applyBtn);
    
    colorPicker.appendChild(buttonsContainer);
    
    document.body.appendChild(overlay);
    document.body.appendChild(colorPicker);
}

// Function to delete node
function deleteNode(node) {
    var nodeId = node.id();
    var isTextNodeType = isTextNode(node);
    var isFileNodeType = isFileNode(node);
    
    // Get all nodes that are linked to it before deletion (both text and file nodes)
    var linkedNodes = [];
    if (isTextNodeType || isFileNodeType) {
        var connectedEdges = node.connectedEdges();
        connectedEdges.forEach(function(edge) {
            var sourceNode = edge.source();
            var targetNode = edge.target();
            var linkedNode = (sourceNode.id() === nodeId) ? targetNode : sourceNode;
            if (isTextNode(linkedNode) || isFileNode(linkedNode)) {
                linkedNodes.push(linkedNode);
            }
        });
    }
    
    // Check if it's a file node and delete the file from storage
    if (isFileNodeType) {
        var fileName = node.data('fileName') || node.data('label');
        
        // Delete file node from API
        deleteFileNodeFromAPI(nodeId);
        
        // Delete file from backend
        fetch(getApiUrl('api/delete'), {
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
    } else if (isTextNodeType) {
        // Delete text node from API
        deleteTextNodeFromAPI(nodeId);
    }
    
    // Remove the node from the graph
    cy.remove(node);
    
    // Update all linked nodes in API (they need to remove this node from their linked_nodes)
    if (linkedNodes.length > 0) {
        setTimeout(function() {
            syncNodesToAPI(linkedNodes);
        }, 100);
    }
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
            
            // Update both connected nodes in API after edge label change
            var sourceNode = edge.source();
            var targetNode = edge.target();
            setTimeout(function() {
                syncNodesToAPI([sourceNode, targetNode]);
            }, 100);
            
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
    // Get nodes before deletion
    var sourceNode = edge.source();
    var targetNode = edge.target();
    
    // Remove the edge from the graph
    cy.remove(edge);
    
    // Update both nodes in API after edge is deleted
    setTimeout(function() {
        syncNodesToAPI([sourceNode, targetNode]);
    }, 100);
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
    
    // Update both nodes in API after edge is created
    setTimeout(function() {
        syncNodesToAPI([sourceNode, targetNode]);
    }, 100);
}

// Event handlers for node_id labels
cy.on('add', 'node', function(evt) {
    updateNodeIdLabel(evt.target);
});

cy.on('position', 'node', function(evt) {
    updateNodeIdLabel(evt.target);
});

cy.on('style', 'node', function(evt) {
    // Update label when node style changes (e.g., size changes)
    updateNodeIdLabel(evt.target);
});

cy.on('remove', 'node', function(evt) {
    removeNodeIdLabel(evt.target.id());
});

cy.on('pan zoom', function() {
    updateAllNodeIdLabels();
});

// Update all labels on initial load
cy.ready(function() {
    updateAllNodeIdLabels();
});

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
        
        // Show unified input box on left click only (not right click)
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
            
            // Store click position (screen coordinates) for input box
            clickPosition = { x: screenX, y: screenY };
            graphPosition = screenToGraph(screenX, screenY);
            
            // Remove existing text input box if any
            if (textInputBox) {
                textInputBox.remove();
                textInputBox = null;
            }
            
            // Create unified input box
            textInputBox = document.createElement('input');
            textInputBox.type = 'text';
            textInputBox.style.left = screenX + 'px';
            textInputBox.style.top = screenY + 'px';
            textInputBox.style.transform = 'translate(-50%, -50%)';
            textInputBox.value = '';
            styleInputBox(textInputBox);
            
            document.body.appendChild(textInputBox);
            textInputBox.focus();
            
            // Handle Enter key to execute command or create node
            textInputBox.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    var input = textInputBox.value.trim();
                    if (input) {
                        // Check if it's a command (starts with /)
                        if (input.startsWith('/')) {
                            handleCommand(input);
                        } else {
                            // Create new node at click position
                            if (graphPosition) {
                                var nodeId = 'node_' + (++nodeIdCounter);
                                var newNode = cy.add({
                                    data: { 
                                        id: nodeId, 
                                        label: input,
                                        editable: true
                                    },
                                    renderedPosition: { x: graphPosition.x, y: graphPosition.y }
                                });
                                
                                // Get linked nodes and send to API (only for text nodes)
                                if (isTextNode(newNode)) {
                                    setTimeout(function() {
                                        var linkedNodes = getLinkedNodes(newNode);
                                        var color = newNode.data('color') || null;
                                        saveTextNodeToAPI(nodeId, input, linkedNodes, color);
                                    }, 100);
                                }
                            }
                        }
                    }
                    textInputBox.remove();
                    textInputBox = null;
                    clickPosition = null;
                    graphPosition = null;
                } else if (e.key === 'Escape') {
                    textInputBox.remove();
                    textInputBox = null;
                    clickPosition = null;
                    graphPosition = null;
                }
            });
            
            // Close on blur
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
        // Right-click on background does nothing (no input box)
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

