const API_BASE_URL = 'http://localhost:8000';

function getApiUrl(endpoint) {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    const cleanBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    return `${cleanBaseUrl}/${cleanEndpoint}`;
}

var cy = cytoscape({
    container: document.getElementById('cy'),
    elements: [],
    style: [{
        selector: 'node',
        style: {
            'width': 300,
            'height': 100,
            'shape': 'round-rectangle',
            'background-color': '#5D6D7E',
            'background-opacity': 0.95,
            'border-width': 3,
            'border-color': '#34495E',
            'border-opacity': 1,
            'border-style': 'solid',
            'label': 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            'color': '#FFFFFF',
            'font-size': '16px',
            'font-weight': '600',
            'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            'text-wrap': 'wrap',
            'text-max-width': '280px',
            'text-outline-width': 2,
            'text-outline-color': '#2C3E50',
            'text-outline-opacity': 0.8,
            'padding': '10px',
            'overlay-opacity': 0,
            'shadow-blur': 8,
            'shadow-color': 'rgba(0, 0, 0, 0.3)',
            'shadow-offset-x': 2,
            'shadow-offset-y': 2,
            'shadow-opacity': 0.6
        }
    }, {
        selector: 'node[color]',
        style: {
            'background-color': 'data(color)',
            'background-opacity': 0.95
        }
    }, {
        selector: 'edge',
        style: {
            'width': 3,
            'line-color': '#7F8C8D',
            'line-style': 'solid',
            'curve-style': 'bezier',
            'target-arrow-shape': 'none',
            'label': 'data(label)',
            'font-size': '13px',
            'font-weight': '500',
            'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            'text-rotation': 'autorotate',
            'text-margin-y': -12,
            'color': '#2C3E50',
            'text-outline-width': 2,
            'text-outline-color': '#FFFFFF',
            'text-outline-opacity': 0.9,
            'opacity': 0.8,
            'overlay-opacity': 0
        }
    }, {
        selector: 'node.linking-source',
        style: {
            'border-color': '#E74C3C',
            'border-width': 5,
            'border-opacity': 1,
            'shadow-blur': 12,
            'shadow-color': '#E74C3C',
            'shadow-opacity': 0.8
        }
    }, {
        selector: 'node.resizing',
        style: {
            'border-color': '#27AE60',
            'border-width': 4,
            'border-opacity': 1,
            'shadow-blur': 10,
            'shadow-color': '#27AE60',
            'shadow-opacity': 0.7
        }
    }, {
        selector: 'node.selected',
        style: {
            'border-color': '#F39C12',
            'border-width': 5,
            'border-opacity': 1,
            'background-color': '#F1C40F',
            'background-opacity': 0.95,
            'shadow-blur': 15,
            'shadow-color': '#F39C12',
            'shadow-opacity': 0.9,
            'shadow-offset-x': 3,
            'shadow-offset-y': 3
        }
    }, {
        selector: 'node.uneditable',
        style: {
            'background-color': '#95A5A6',
            'background-opacity': 0.85,
            'border-color': '#7F8C8D',
            'border-width': 2,
            'opacity': 0.85,
            'shadow-opacity': 0.3
        }
    }]
});

var container = document.getElementById('cy');
var nodeIdCounter = 0;
var edgeIdCounter = 0;
var linkingMode = false;
var sourceNodeForLink = null;
var textInputBox = null;
var clickPosition = null;
var graphPosition = null;
var contextMenu = null;
var selectedNode = null;
var selectedEdge = null;
var isNodeRightClick = false;
var isEdgeRightClick = false;
var resizingMode = false;
var nodeBeingResized = null;
var resizeStartWidth = 0;
var resizeStartHeight = 0;
var resizeStartMouseX = 0;
var resizeStartMouseY = 0;
var nodeIdLabels = {};

function screenToGraph(screenX, screenY) {
    var containerRect = container.getBoundingClientRect();
    var renderedX = screenX - containerRect.left;
    var renderedY = screenY - containerRect.top;
    return { x: renderedX, y: renderedY };
}

function updateNodeIdLabel(node) {
    var nodeId = node.id();
    var nodePos = node.renderedPosition();
    var containerRect = container.getBoundingClientRect();
    var nodeHeight = node.height();
    
    var screenX = containerRect.left + nodePos.x;
    var screenY = containerRect.top + nodePos.y - (nodeHeight / 2 + 15);
    
    var labelElement = nodeIdLabels[nodeId];
    if (!labelElement) {
        labelElement = document.createElement('div');
        labelElement.className = 'node-id-label';
        container.appendChild(labelElement);
        nodeIdLabels[nodeId] = labelElement;
    }
    
    labelElement.textContent = nodeId;
    labelElement.style.left = screenX + 'px';
    labelElement.style.top = screenY + 'px';
}

function removeNodeIdLabel(nodeId) {
    var labelElement = nodeIdLabels[nodeId];
    if (labelElement) {
        labelElement.remove();
        delete nodeIdLabels[nodeId];
    }
}

function updateAllNodeIdLabels() {
    cy.nodes().forEach(function(node) {
        updateNodeIdLabel(node);
    });
}

function createInputBox(x, y, value, transform) {
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'text-input-box';
    input.style.left = x + 'px';
    input.style.top = y + 'px';
    input.style.transform = transform || 'translate(-50%, -50%)';
    input.value = value || '';
    input.setAttribute('placeholder', 'Type node label or command (e.g., /load, /ask, /search)');
    
    var baseTransform = transform || 'translate(-50%, -50%)';
    input.dataset.baseTransform = baseTransform;
    
    input.addEventListener('focus', function() {
        var base = this.dataset.baseTransform || 'translate(-50%, -50%)';
        this.style.transform = base + ' scale(1.02)';
    });
    
    input.addEventListener('blur', function() {
        var base = this.dataset.baseTransform || 'translate(-50%, -50%)';
        this.style.transform = base;
    });
    
    return input;
}

function createButton(text, className, onClick) {
    var button = document.createElement('button');
    button.textContent = text;
    button.className = 'btn ' + (className || 'btn-primary');
    if (onClick) {
        button.addEventListener('click', onClick);
    }
    return button;
}

function createModal(titleText, contentHtml, buttons) {
    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    
    var modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    var title = document.createElement('h2');
    title.className = 'modal-title';
    title.textContent = titleText;
    
    var body = document.createElement('div');
    body.className = 'modal-body';
    if (typeof contentHtml === 'string') {
        body.innerHTML = contentHtml;
    } else {
        body.appendChild(contentHtml);
    }
    
    var buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'modal-buttons';
    
    if (buttons) {
        buttons.forEach(function(btn) {
            buttonsContainer.appendChild(btn);
        });
    }
    
    var closeBtn = createButton('Close', 'btn-primary', function() {
        document.body.removeChild(modal);
    });
    buttonsContainer.appendChild(closeBtn);
    
    modalContent.appendChild(title);
    modalContent.appendChild(body);
    modalContent.appendChild(buttonsContainer);
    modal.appendChild(modalContent);
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    document.body.appendChild(modal);
    return { modal: modal, body: body };
}

function createContextMenuItem(label, action) {
    var menuItem = document.createElement('div');
    menuItem.className = 'context-menu-item';
    menuItem.textContent = label;
    menuItem.addEventListener('click', function() {
        action();
        removeContextMenu();
    });
    return menuItem;
}

function removeContextMenu() {
    if (contextMenu) {
        contextMenu.remove();
        contextMenu = null;
        selectedEdge = null;
        isNodeRightClick = false;
        isEdgeRightClick = false;
    }
}

function createContextMenu(x, y, items) {
    removeContextMenu();
    
    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    
    items.forEach(function(item) {
        contextMenu.appendChild(createContextMenuItem(item.label, item.action));
    });
    
    document.body.appendChild(contextMenu);
}

function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatSearchResults(data) {
    var html = '';
    
    if (data.answer) {
        html += '<div class="search-answer">';
        html += '<strong class="search-answer-title">Answer:</strong>';
        html += '<p class="search-answer-content">' + escapeHtml(data.answer) + '</p>';
        html += '</div>';
    }
    
    if (data.results && data.results.length > 0) {
        html += '<div style="margin-top: 20px;">';
        html += '<strong class="search-results-title">Search Results (' + data.results.length + '):</strong>';
        html += '<div style="margin-top: 12px;">';
        
        data.results.forEach(function(result) {
            html += '<div class="search-result-item">';
            
            if (result.url) {
                html += '<h3 class="search-result-title">';
                html += '<a href="' + escapeHtml(result.url) + '" target="_blank" class="search-result-link">';
                html += escapeHtml(result.title || 'No title');
                html += '</a>';
                html += '</h3>';
            } else {
                html += '<h3 class="search-result-title" style="color: #2c3e50; font-size: 16px;">';
                html += escapeHtml(result.title || 'No title');
                html += '</h3>';
            }
            
            if (result.content) {
                html += '<p class="search-result-content">';
                html += escapeHtml(result.content.length > 300 ? result.content.substring(0, 300) + '...' : result.content);
                html += '</p>';
            }
            
            if (result.url) {
                html += '<a href="' + escapeHtml(result.url) + '" target="_blank" class="search-result-url">';
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
    
    return html;
}

function handleCommand(command) {
    command = command.trim();
    
    if (command === '/load') {
        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.style.display = 'none';
        fileInput.accept = '*/*';
        
        fileInput.addEventListener('change', function(e) {
            var file = e.target.files[0];
            if (file) {
                uploadFileToDB(file);
            }
            document.body.removeChild(fileInput);
        });
        
        document.body.appendChild(fileInput);
        fileInput.click();
    } else if (command.startsWith('/ask ')) {
        var query = command.substring(5).trim();
        if (query) {
            askQuestion(query);
        } else {
            alert('Please provide a question after /ask');
        }
    } else if (command.startsWith('/search ')) {
        var query = command.substring(8).trim();
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

function askQuestion(query) {
    var modalData = createModal('Question: ' + query, 'Thinking...', []);
    var answerDiv = modalData.body;
    var modal = modalData.modal;
    
    var createNodeButton = createButton('Create Node', 'btn-success', null);
    createNodeButton.disabled = true;
    createNodeButton.style.opacity = '0.5';
    
    var buttonsContainer = modal.querySelector('.modal-buttons');
    buttonsContainer.insertBefore(createNodeButton, buttonsContainer.firstChild);
    
    var fullAnswer = '';
    var responseCompleted = false;
    
    function enableCreateNodeButton() {
        createNodeButton.disabled = false;
        createNodeButton.style.opacity = '1';
    }
    
    function createNodeFromResponse() {
        if (!fullAnswer.trim()) {
            alert('No response text to create node from');
            return;
        }
        
        var containerRect = container.getBoundingClientRect();
        var centerScreenX = containerRect.left + containerRect.width / 2;
        var centerScreenY = containerRect.top + containerRect.height / 2;
        var graphPos = screenToGraph(centerScreenX, centerScreenY);
        
        var nodeId = 'node_' + (++nodeIdCounter);
        var newNode = cy.add({
            data: { 
                id: nodeId, 
                label: fullAnswer.trim(),
                editable: true
            },
            renderedPosition: { x: graphPos.x, y: graphPos.y }
        });
        
        setTimeout(function() {
            var linkedNodes = getLinkedNodes(newNode);
            var color = newNode.data('color') || null;
            saveTextNodeToAPI(nodeId, fullAnswer.trim(), linkedNodes, color);
        }, 100);
        
        setTimeout(function() {
            focusOnNode(newNode);
        }, 100);
        
        document.body.removeChild(modal);
    }
    
    createNodeButton.addEventListener('click', function() {
        if (!createNodeButton.disabled) {
            createNodeFromResponse();
        }
    });
    
    fetch(getApiUrl('api/ask'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query })
    })
    .then(function(response) {
        if (!response.ok) {
            throw new Error('Failed to get answer: ' + response.statusText);
        }
        
        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';
        
        function readStream() {
            reader.read().then(function(result) {
                if (result.done) {
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
                    if (!responseCompleted) {
                        responseCompleted = true;
                        enableCreateNodeButton();
                    }
                    return;
                }
                
                buffer += decoder.decode(result.value, { stream: true });
                var lines = buffer.split('\n');
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

function performSearch(query) {
    var modalData = createModal('Search: ' + query, 'Searching...', []);
    var resultsDiv = modalData.body;
    var modal = modalData.modal;
    
    fetch(getApiUrl('api/search'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query })
    })
    .then(function(response) {
        if (!response.ok) {
            throw new Error('Failed to perform search: ' + response.statusText);
        }
        return response.json();
    })
    .then(function(data) {
        resultsDiv.innerHTML = formatSearchResults(data);
    })
    .catch(function(error) {
        console.error('Error performing search:', error);
        resultsDiv.innerHTML = '<p style="color: #e74c3c;">Error: ' + escapeHtml(error.message) + '</p>';
    });
}

function getCenterPosition() {
    var containerRect = container.getBoundingClientRect();
    var centerScreenX = containerRect.left + containerRect.width / 2;
    var centerScreenY = containerRect.top + containerRect.height / 2;
    return screenToGraph(centerScreenX, centerScreenY);
}

function createFileNode(fileName, position, actualFileName) {
    var nodeId = 'node_' + (++nodeIdCounter);
    var nodePosition = (position && position.x !== undefined && position.y !== undefined) 
        ? position 
        : getCenterPosition();
    var storedFileName = actualFileName || fileName;
    
    var newNode = cy.add({
        data: { 
            id: nodeId, 
            label: fileName,
            fileName: storedFileName,
            editable: false,
            type: 'file'
        },
        renderedPosition: { x: nodePosition.x, y: nodePosition.y },
        classes: 'uneditable'
    });
    
    setTimeout(function() {
        var linkedNodes = getLinkedNodes(newNode);
        var color = newNode.data('color') || null;
        saveFileNodeToAPI(nodeId, fileName, linkedNodes, storedFileName, color);
    }, 100);
    
    return newNode;
}

function getLinkedNodes(node) {
    var linkedNodes = [];
    var connectedEdges = node.connectedEdges();
    
    connectedEdges.forEach(function(edge) {
        var sourceNode = edge.source();
        var targetNode = edge.target();
        var linkageLabel = edge.data('label') || '';
        var linkedNode = (sourceNode.id() === node.id()) ? targetNode : sourceNode;
        
        linkedNodes.push({
            node_id: linkedNode.id(),
            linkage_label: linkageLabel
        });
    });
    
    return linkedNodes;
}

function isTextNode(node) {
    return node.data('type') !== 'file' && node.data('editable') !== false;
}

function isFileNode(node) {
    return node.data('type') === 'file';
}

function makeApiRequest(url, method, payload) {
    var options = {
        method: method,
        headers: { 'Content-Type': 'application/json' }
    };
    
    if (payload) {
        options.body = JSON.stringify(payload);
    }
    
    return fetch(getApiUrl(url), options)
        .then(function(response) {
            if (!response.ok) {
                throw new Error('API request failed: ' + response.statusText);
            }
            return response.json();
        });
}

function saveTextNodeToAPI(nodeId, label, linkedNodes, color) {
    var payload = {
        node_id: nodeId,
        label: label,
        linked_nodes: linkedNodes
    };
    if (color) {
        payload.color = color;
    }
    
    makeApiRequest('api/text-node', 'POST', payload)
        .then(function(data) {
            console.log('Text node saved successfully:', data);
        })
        .catch(function(error) {
            console.error('Error saving text node:', error);
        });
}

function updateTextNodeInAPI(nodeId, label, linkedNodes, color) {
    var payload = {
        node_id: nodeId,
        label: label,
        linked_nodes: linkedNodes
    };
    if (color) {
        payload.color = color;
    }
    
    makeApiRequest('api/text-node', 'PUT', payload)
        .then(function(data) {
            console.log('Text node updated successfully:', data);
        })
        .catch(function(error) {
            console.error('Error updating text node:', error);
        });
}

function deleteTextNodeFromAPI(nodeId) {
    makeApiRequest('api/text-node/' + encodeURIComponent(nodeId), 'DELETE')
        .then(function(data) {
            console.log('Text node deleted successfully:', data);
        })
        .catch(function(error) {
            console.error('Error deleting text node:', error);
        });
}

function syncTextNodeToAPI(node) {
    if (!isTextNode(node)) {
        return;
    }
    
    var nodeId = node.id();
    var label = node.data('label') || '';
    var linkedNodes = getLinkedNodes(node);
    var color = node.data('color') || null;
    
    updateTextNodeInAPI(nodeId, label, linkedNodes, color);
}

function syncTextNodesToAPI(nodes) {
    nodes.forEach(function(node) {
        syncTextNodeToAPI(node);
    });
}

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
    
    makeApiRequest('api/file-node', 'POST', payload)
        .then(function(data) {
            console.log('File node saved successfully:', data);
        })
        .catch(function(error) {
            console.error('Error saving file node:', error);
        });
}

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
    
    makeApiRequest('api/file-node', 'PUT', payload)
        .then(function(data) {
            console.log('File node updated successfully:', data);
        })
        .catch(function(error) {
            console.error('Error updating file node:', error);
        });
}

function deleteFileNodeFromAPI(nodeId) {
    makeApiRequest('api/file-node/' + encodeURIComponent(nodeId), 'DELETE')
        .then(function(data) {
            console.log('File node deleted successfully:', data);
        })
        .catch(function(error) {
            console.error('Error deleting file node:', error);
        });
}

function syncFileNodeToAPI(node) {
    if (!isFileNode(node)) {
        return;
    }
    
    var nodeId = node.id();
    var label = node.data('label') || '';
    var filename = node.data('fileName') || '';
    var linkedNodes = getLinkedNodes(node);
    var color = node.data('color') || null;
    
    updateFileNodeInAPI(nodeId, label, linkedNodes, filename, color);
}

function syncFileNodesToAPI(nodes) {
    nodes.forEach(function(node) {
        syncFileNodeToAPI(node);
    });
}

function syncNodeToAPI(node) {
    if (isTextNode(node)) {
        syncTextNodeToAPI(node);
    } else if (isFileNode(node)) {
        syncFileNodeToAPI(node);
    }
}

function syncNodesToAPI(nodes) {
    nodes.forEach(function(node) {
        syncNodeToAPI(node);
    });
}

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
        var actualFileName = data.filename || file.name;
        var fileNode = createFileNode(file.name, null, actualFileName);
        setTimeout(function() {
            focusOnNode(fileNode);
        }, 100);
    })
    .catch(function(error) {
        console.error('Error uploading file:', error);
        alert('Error uploading file: ' + error.message);
    });
}

function deselectAllNodes() {
    cy.nodes().removeClass('selected');
    selectedNode = null;
}

function selectNode(node) {
    deselectAllNodes();
    node.addClass('selected');
    selectedNode = node;
}

function focusOnNode(node) {
    if (!node) return;
    cy.animate({
        center: { eles: node },
        zoom: Math.max(cy.zoom(), 1.5),
        duration: 300
    });
}

function createNodeContextMenu(x, y, node) {
    removeContextMenu();
    selectNode(node);
    
    var menuItems = [];
    
    if (node.data('editable') !== false && !node.hasClass('uneditable')) {
        menuItems.push({ label: 'Edit', action: function() { editNode(node); } });
    }
    
    menuItems.push(
        { label: 'Change Color', action: function() { changeNodeColor(node); } },
        { label: 'Resize', action: function() { startResizing(node, 0, 0); } },
        { label: 'Link', action: function() { startLinking(node); } },
        { label: 'Delete', action: function() { deleteNode(node); } }
    );
    
    createContextMenu(x, y, menuItems);
}

function editNode(node) {
    if (node.data('editable') === false || node.hasClass('uneditable')) {
        alert('This node cannot be edited.');
        return;
    }
    
    var currentLabel = node.data('label') || '';
    
    if (textInputBox) {
        textInputBox.remove();
        textInputBox = null;
    }
    
    var nodePos = node.renderedPosition();
    var containerRect = container.getBoundingClientRect();
    var screenX = containerRect.left + nodePos.x;
    var screenY = containerRect.top + nodePos.y;
    
    textInputBox = createInputBox(screenX, screenY, currentLabel);
    document.body.appendChild(textInputBox);
    textInputBox.focus();
    textInputBox.select();
    
    textInputBox.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            var newLabel = textInputBox.value.trim();
            if (newLabel) {
                node.data('label', newLabel);
                syncNodeToAPI(node);
            }
            textInputBox.remove();
            textInputBox = null;
        } else if (e.key === 'Escape') {
            textInputBox.remove();
            textInputBox = null;
        }
    });
    
    textInputBox.addEventListener('blur', function() {
        setTimeout(function() {
            if (textInputBox) {
                textInputBox.remove();
                textInputBox = null;
            }
        }, 200);
    });
}

function changeNodeColor(node) {
    var currentColor = node.data('color') || 'grey';
    var existingPicker = document.getElementById('color-picker-container');
    if (existingPicker) {
        existingPicker.remove();
    }
    
    var overlay = document.createElement('div');
    overlay.className = 'color-picker-overlay';
    
    var colorPicker = document.createElement('div');
    colorPicker.id = 'color-picker-container';
    colorPicker.className = 'color-picker-container';
    
    var title = document.createElement('h3');
    title.className = 'color-picker-title';
    title.textContent = 'Change Node Color';
    colorPicker.appendChild(title);
    
    var colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'color-input';
    colorInput.value = currentColor === 'grey' ? '#808080' : currentColor;
    colorPicker.appendChild(colorInput);
    
    var preview = document.createElement('div');
    preview.className = 'color-preview';
    preview.style.backgroundColor = colorInput.value;
    colorPicker.appendChild(preview);
    
    colorInput.addEventListener('input', function() {
        preview.style.backgroundColor = colorInput.value;
    });
    
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
    presetContainer.className = 'color-presets';
    
    presetColors.forEach(function(preset) {
        var presetBtn = document.createElement('button');
        presetBtn.className = 'color-preset-btn';
        presetBtn.style.backgroundColor = preset.value;
        presetBtn.title = preset.name;
        presetBtn.addEventListener('click', function() {
            colorInput.value = preset.value;
            preview.style.backgroundColor = preset.value;
        });
        presetContainer.appendChild(presetBtn);
    });
    
    colorPicker.appendChild(presetContainer);
    
    var buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'modal-buttons';
    
    var cancelBtn = createButton('Cancel', 'btn-secondary', function() {
        overlay.remove();
        colorPicker.remove();
    });
    buttonsContainer.appendChild(cancelBtn);
    
    var applyBtn = createButton('Apply', 'btn-primary', function() {
        var newColor = colorInput.value;
        node.data('color', newColor);
        syncNodeToAPI(node);
        overlay.remove();
        colorPicker.remove();
    });
    buttonsContainer.appendChild(applyBtn);
    
    colorPicker.appendChild(buttonsContainer);
    
    overlay.addEventListener('click', function() {
        overlay.remove();
        colorPicker.remove();
    });
    
    document.body.appendChild(overlay);
    document.body.appendChild(colorPicker);
}

function deleteNode(node) {
    var nodeId = node.id();
    var isTextNodeType = isTextNode(node);
    var isFileNodeType = isFileNode(node);
    
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
    
    if (isFileNodeType) {
        var fileName = node.data('fileName') || node.data('label');
        deleteFileNodeFromAPI(nodeId);
        
        fetch(getApiUrl('api/delete'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: fileName })
        })
        .then(function(response) {
            if (!response.ok) {
                console.warn('Failed to delete file from storage:', fileName);
            }
            return response.json();
        })
        .then(function(data) {
            console.log('File deleted from storage:', fileName);
        })
        .catch(function(error) {
            console.error('Error deleting file from storage:', error);
        });
    } else if (isTextNodeType) {
        deleteTextNodeFromAPI(nodeId);
    }
    
    cy.remove(node);
    
    if (linkedNodes.length > 0) {
        setTimeout(function() {
            syncNodesToAPI(linkedNodes);
        }, 100);
    }
}

function editEdge(edge) {
    var currentLabel = edge.data('label') || '';
    
    if (textInputBox) {
        textInputBox.remove();
        textInputBox = null;
    }
    
    var sourcePos = edge.source().renderedPosition();
    var targetPos = edge.target().renderedPosition();
    var midX = (sourcePos.x + targetPos.x) / 2;
    var midY = (sourcePos.y + targetPos.y) / 2;
    var containerRect = container.getBoundingClientRect();
    var screenX = containerRect.left + midX;
    var screenY = containerRect.top + midY;
    
    textInputBox = createInputBox(screenX, screenY, currentLabel);
    document.body.appendChild(textInputBox);
    textInputBox.focus();
    textInputBox.select();
    
    textInputBox.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            var newLabel = textInputBox.value.trim();
            edge.data('label', newLabel);
            
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
    
    textInputBox.addEventListener('blur', function() {
        setTimeout(function() {
            if (textInputBox) {
                textInputBox.remove();
                textInputBox = null;
            }
        }, 200);
    });
}

function deleteEdge(edge) {
    var sourceNode = edge.source();
    var targetNode = edge.target();
    cy.remove(edge);
    setTimeout(function() {
        syncNodesToAPI([sourceNode, targetNode]);
    }, 100);
}

function startResizing(node, mouseX, mouseY) {
    cancelResizing();
    
    if (linkingMode) {
        cancelLinking();
    }
    
    resizingMode = true;
    nodeBeingResized = node;
    resizeStartWidth = node.width();
    resizeStartHeight = node.height();
    resizeStartMouseX = mouseX || 0;
    resizeStartMouseY = mouseY || 0;
    node.addClass('resizing');
    container.style.cursor = 'nwse-resize';
}

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

function resizeNode(mouseX, mouseY) {
    if (!resizingMode || !nodeBeingResized) {
        return;
    }
    
    var nodePos = nodeBeingResized.renderedPosition();
    var containerRect = container.getBoundingClientRect();
    var nodeScreenX = containerRect.left + nodePos.x;
    var nodeScreenY = containerRect.top + nodePos.y;
    var deltaX = mouseX - nodeScreenX;
    var deltaY = mouseY - nodeScreenY;
    var zoom = cy.zoom();
    var newWidth = Math.max(50, Math.abs(deltaX) * 2 / zoom);
    var newHeight = Math.max(50, Math.abs(deltaY) * 2 / zoom);
    
    nodeBeingResized.style('width', newWidth);
    nodeBeingResized.style('height', newHeight);
}

function createEdgeContextMenu(x, y, edge) {
    removeContextMenu();
    selectedEdge = edge;
    
    var menuItems = [
        { label: 'Edit', action: function() { editEdge(edge); } },
        { label: 'Delete', action: function() { deleteEdge(edge); } }
    ];
    
    createContextMenu(x, y, menuItems);
}

function startLinking(node) {
    cancelLinking();
    linkingMode = true;
    sourceNodeForLink = node;
    node.addClass('linking-source');
    container.style.cursor = 'crosshair';
}

function cancelLinking() {
    if (sourceNodeForLink) {
        sourceNodeForLink.removeClass('linking-source');
    }
    linkingMode = false;
    sourceNodeForLink = null;
    container.style.cursor = '';
}

function createEdge(sourceNode, targetNode) {
    if (sourceNode.id() === targetNode.id()) {
        return;
    }
    
    var existingEdges = cy.edges().filter(function(edge) {
        return (edge.source().id() === sourceNode.id() && edge.target().id() === targetNode.id()) ||
               (edge.source().id() === targetNode.id() && edge.target().id() === sourceNode.id());
    });
    
    if (existingEdges.length > 0) {
        return;
    }
    
    var edgeId = 'edge_' + (++edgeIdCounter);
    cy.add({
        data: {
            id: edgeId,
            source: sourceNode.id(),
            target: targetNode.id(),
            label: ''
        }
    });
    
    setTimeout(function() {
        syncNodesToAPI([sourceNode, targetNode]);
    }, 100);
}

cy.on('add', 'node', function(evt) {
    updateNodeIdLabel(evt.target);
});

cy.on('position', 'node', function(evt) {
    updateNodeIdLabel(evt.target);
});

cy.on('style', 'node', function(evt) {
    updateNodeIdLabel(evt.target);
});

cy.on('remove', 'node', function(evt) {
    removeNodeIdLabel(evt.target.id());
});

cy.on('pan zoom', function() {
    updateAllNodeIdLabels();
});

cy.ready(function() {
    updateAllNodeIdLabels();
});

cy.on('tap', 'node', function(evt) {
    var clickedNode = evt.target;
    
    if (linkingMode && sourceNodeForLink) {
        if (sourceNodeForLink.id() !== clickedNode.id()) {
            createEdge(sourceNodeForLink, clickedNode);
        }
        cancelLinking();
    }
    
    if (resizingMode) {
        cancelResizing();
    }
    
    if (!linkingMode) {
        selectNode(clickedNode);
    }
});

cy.on('dbltap', 'node', function(evt) {
    var clickedNode = evt.target;
    selectNode(clickedNode);
    focusOnNode(clickedNode);
});

cy.on('tap', function(evt) {
    if (evt.target === cy) {
        var originalEvent = evt.originalEvent || evt.cyEvent;
        var isRightClick = false;
        
        if (originalEvent) {
            if (originalEvent.button !== undefined && originalEvent.button === 2) {
                isRightClick = true;
            }
            if (originalEvent.type === 'contextmenu') {
                isRightClick = true;
            }
        }
        
        if (linkingMode) {
            cancelLinking();
        }
        if (resizingMode) {
            cancelResizing();
        }
        deselectAllNodes();
        
        if (!isRightClick && !contextMenu) {
            var screenX = originalEvent ? (originalEvent.clientX || originalEvent.pageX || 0) : 0;
            var screenY = originalEvent ? (originalEvent.clientY || originalEvent.pageY || 0) : 0;
            
            if (!screenX || !screenY) {
                var containerRect = container.getBoundingClientRect();
                screenX = containerRect.left + containerRect.width / 2;
                screenY = containerRect.top + containerRect.height / 2;
            }
            
            clickPosition = { x: screenX, y: screenY };
            graphPosition = screenToGraph(screenX, screenY);
            
            if (textInputBox) {
                textInputBox.remove();
                textInputBox = null;
            }
            
            textInputBox = createInputBox(screenX, screenY, '');
            document.body.appendChild(textInputBox);
            textInputBox.focus();
            
            textInputBox.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    var input = textInputBox.value.trim();
                    if (input) {
                        if (input.startsWith('/')) {
                            handleCommand(input);
                        } else {
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

cy.on('cxttap', 'edge', function(evt) {
    isEdgeRightClick = true;
    
    var originalEvent = evt.originalEvent || evt.cyEvent || evt;
    var screenX = originalEvent.clientX || originalEvent.pageX;
    var screenY = originalEvent.clientY || originalEvent.pageY;
    
    if (!screenX || !screenY) {
        var sourcePos = evt.target.source().renderedPosition();
        var targetPos = evt.target.target().renderedPosition();
        var midX = (sourcePos.x + targetPos.x) / 2;
        var midY = (sourcePos.y + targetPos.y) / 2;
        var containerRect = container.getBoundingClientRect();
        screenX = containerRect.left + midX;
        screenY = containerRect.top + midY;
    }
    
    createEdgeContextMenu(screenX, screenY, evt.target);
    
    setTimeout(function() {
        isEdgeRightClick = false;
    }, 100);
});

cy.on('cxttap', 'node', function(evt) {
    isNodeRightClick = true;
    
    var originalEvent = evt.originalEvent || evt.cyEvent || evt;
    var screenX = originalEvent.clientX || originalEvent.pageX;
    var screenY = originalEvent.clientY || originalEvent.pageY;
    
    if (!screenX || !screenY) {
        var nodePos = evt.target.renderedPosition();
        var containerRect = container.getBoundingClientRect();
        screenX = containerRect.left + nodePos.x;
        screenY = containerRect.top + nodePos.y;
    }
    
    createNodeContextMenu(screenX, screenY, evt.target);
    
    setTimeout(function() {
        isNodeRightClick = false;
    }, 100);
});

cy.on('cxttap', function(evt) {
    if (evt.target === cy) {
        if (linkingMode) {
            cancelLinking();
        }
        if (resizingMode) {
            cancelResizing();
        }
    }
});

container.addEventListener('contextmenu', function(e) {
    if (linkingMode) {
        cancelLinking();
    }
    if (resizingMode) {
        cancelResizing();
    }
    
    if (isNodeRightClick || isEdgeRightClick || contextMenu) {
        e.preventDefault();
        return;
    }
    
    e.preventDefault();
});

container.addEventListener('mousemove', function(e) {
    if (resizingMode && nodeBeingResized) {
        resizeNode(e.clientX, e.clientY);
    }
});

document.addEventListener('click', function(e) {
    if (contextMenu && !contextMenu.contains(e.target)) {
        removeContextMenu();
    }
});

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
