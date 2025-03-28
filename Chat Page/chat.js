// Initialize variables
let currentUser = null;
let currentPeer = null;
let activeConnection = null;
let activeContactPeerId = null;

// DOM Elements
const currentUsernameEl = document.getElementById('currentUsername');
const peerIdEl = document.getElementById('peerId');
const contactUsernameEl = document.getElementById('contactUsername');
const contactPeerIdEl = document.getElementById('contactPeerId');
const connectionStatusEl = document.getElementById('connectionStatus');
const chatMessagesEl = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const fileUpload = document.getElementById('fileUpload');
const backToContactsBtn = document.getElementById('backToContacts');
const logoutBtn = document.getElementById('logoutBtn');
const fileTransferProgress = document.getElementById('fileTransferProgress');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const fileTransferTitle = document.getElementById('fileTransferTitle');

// Show loading screen when page loads
document.addEventListener('DOMContentLoaded', () => {
    if (window.Loader) {
        Loader.show();
    }

    // Check if user is logged in
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            // User is signed in
            currentUser = user;
            initializeApp();
        } else {
            // No user is signed in, redirect to login page
            window.location.href = '../Login page/login.html';
        }
    });
});

// Initialize the application
function initializeApp() {
    // Get the contact peer ID from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    activeContactPeerId = urlParams.get('peerId');
    const contactUsername = urlParams.get('username');

    if (!activeContactPeerId) {
        // If no peer ID is provided, redirect to contacts page
        window.location.href = '../Conncetions Page/connections.html';
        return;
    }

    // Update UI with contact info
    contactUsernameEl.textContent = contactUsername || 'Unknown Contact';
    contactPeerIdEl.textContent = `Peer ID: ${activeContactPeerId}`;
    updateConnectionStatus('connecting');

    // Get current user's username from Firebase
    const userRef = firebase.database().ref(`users/${currentUser.uid}`);
    userRef.once('value').then((snapshot) => {
        const userData = snapshot.val();
        if (userData && userData.username) {
            currentUsernameEl.textContent = userData.username;
            
            // Initialize PeerJS with the username as the peer ID
            initializePeer(userData.username);
        } else {
            // If username is not found, use UID as fallback
            currentUsernameEl.textContent = currentUser.uid;
            initializePeer(currentUser.uid);
        }
    }).catch((error) => {
        console.error("Error getting user data:", error);
        // Use UID as fallback
        currentUsernameEl.textContent = currentUser.uid;
        initializePeer(currentUser.uid);
    });

    // Set up event listeners
    setupEventListeners();

    // Hide loading screen
    if (window.Loader) {
        Loader.hide();
    }
}

// Initialize PeerJS with fallback options
function initializePeer(username) {
    // Define server options with fallbacks
    const serverOptions = [
        {
            // Default PeerJS cloud server
            host: 'peerjs.com',
            secure: true,
            port: 443,
            path: '/'
        },
        {
            // Backup server option
            host: 'peerjs-server.herokuapp.com',
            secure: true,
            port: 443,
            path: '/'
        },
        {
            // Another backup option
            host: '0.peerjs.com',
            secure: true,
            port: 443,
            path: '/'
        },
        {
            // Last fallback - use local discovery only
            // This will work if both peers are on the same network
        }
    ];

    // Enhanced STUN/TURN server configuration for better connectivity
    const iceServers = {
        'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            { urls: 'stun:stun.stunprotocol.org:3478' },
            { urls: 'stun:stun.voiparound.com:3478' },
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ]
    };

    // If there's an existing peer, clean it up properly
    if (currentPeer) {
        try {
            currentPeer.destroy();
        } catch (e) {
            console.log('Error destroying previous peer:', e);
        }
        currentPeer = null;
    }

    // Try to connect with the first server option
    tryConnectWithServer(username, 0);

    function tryConnectWithServer(username, serverIndex) {
        // If we've tried all server options, show error
        if (serverIndex >= serverOptions.length) {
            showErrorMessage('Failed to connect to any PeerJS server. Please try again later.');
            updateConnectionStatus('offline');
            return;
        }

        const options = {
            debug: 2,
            config: iceServers
        };

        // Add server options if not using the last fallback
        if (serverOptions[serverIndex].host) {
            options.host = serverOptions[serverIndex].host;
            options.secure = serverOptions[serverIndex].secure;
            options.port = serverOptions[serverIndex].port;
        }

        console.log(`Trying PeerJS server option ${serverIndex + 1}/${serverOptions.length}`);

        try {
            // Create a new Peer with the username as the ID
            currentPeer = new Peer(username, options);

            // Update UI with peer ID
            peerIdEl.textContent = `Peer ID: ${username}`;

            // Set connection timeout
            const connectionTimeout = setTimeout(() => {
                if (currentPeer && !currentPeer.open) {
                    console.log(`Connection to server option ${serverIndex + 1} timed out, trying next option...`);
                    const tempPeer = currentPeer;
                    currentPeer = null;
                    try {
                        tempPeer.destroy();
                    } catch (e) {
                        console.log('Error destroying peer on timeout:', e);
                    }
                    tryConnectWithServer(username, serverIndex + 1);
                }
            }, 10000); // 10 second timeout

            // Handle peer events
            currentPeer.on('open', (id) => {
                clearTimeout(connectionTimeout);
                console.log('My peer ID is: ' + id);
                showSystemMessage('Connected to PeerJS server');

                // Connect to the contact after a short delay to ensure the connection is stable
                setTimeout(() => {
                    if (currentPeer && currentPeer.open && activeContactPeerId) {
                        connectToPeer(activeContactPeerId);
                    }
                }, 1000);
            });

            currentPeer.on('connection', (conn) => {
                console.log('Incoming connection from:', conn.peer);
                handleConnection(conn);
            });

            currentPeer.on('disconnected', () => {
                console.log('Disconnected from PeerJS server, attempting to reconnect...');
                showSystemMessage('Disconnected from server. Reconnecting...');

                // Try to reconnect to the server
                if (currentPeer) {
                    currentPeer.reconnect();
                }

                // If reconnection fails after some time, create a new peer
                setTimeout(() => {
                    if (currentPeer && !currentPeer.open) {
                        console.log('Reconnection failed, creating new peer...');
                        const tempPeer = currentPeer;
                        currentPeer = null;
                        try {
                            tempPeer.destroy();
                        } catch (e) {
                            console.log('Error destroying peer on reconnection failure:', e);
                        }
                        initializePeer(username);
                    }
                }, 5000);
            });

            currentPeer.on('close', () => {
                console.log('PeerJS connection closed');
                updateConnectionStatus('offline');

                // Create a new peer after a delay
                setTimeout(() => {
                    if (!currentPeer || !currentPeer.open) {
                        initializePeer(username);
                    }
                }, 5000);
            });

            currentPeer.on('error', (err) => {
                clearTimeout(connectionTimeout);
                console.error('Peer error:', err);

                if (err.type === 'server-error' || err.type === 'network' || err.type === 'socket-error' ||
                    err.type === 'unavailable-id' || err.message && err.message.includes('disconnect')) {
                    console.log(`Error with server option ${serverIndex + 1}, trying next option...`);
                    const tempPeer = currentPeer;
                    currentPeer = null;
                    try {
                        tempPeer.destroy();
                    } catch (e) {
                        console.log('Error destroying peer on error:', e);
                    }
                    tryConnectWithServer(username, serverIndex + 1);
                } else {
                    updateConnectionStatus('offline');

                    // Show more specific error messages
                    let errorMessage = 'Connection error';
                    if (err.type === 'peer-unavailable') {
                        errorMessage = 'The contact is offline or unavailable';
                    } else if (err.type === 'network') {
                        errorMessage = 'Network connection issue. Please check your internet connection';
                    } else if (err.type === 'server-error') {
                        errorMessage = 'PeerJS server error. Please try again later';
                    } else if (err.type) {
                        errorMessage = `Connection error: ${err.type}`;
                    }

                    showErrorMessage(errorMessage);
                }
            });
        } catch (error) {
            console.error('Error creating Peer:', error);
            showErrorMessage(`Error creating peer connection: ${error.message}`);

            // Try next server option
            setTimeout(() => {
                tryConnectWithServer(username, serverIndex + 1);
            }, 1000);
        }
    }
}

// Connect to a peer
function connectToPeer(peerId) {
    if (!currentPeer) {
        console.error('Cannot connect: PeerJS not initialized');
        showErrorMessage('Connection error: PeerJS not initialized');
        updateConnectionStatus('offline');
        return;
    }

    if (!currentPeer.open) {
        console.error('Cannot connect: PeerJS not connected to server');
        showErrorMessage('Connection error: Not connected to server. Reconnecting...');
        updateConnectionStatus('offline');
        
        // Try to reconnect to the server first
        try {
            currentPeer.reconnect();
            
            // Set a timeout to check if reconnection was successful
            setTimeout(() => {
                if (currentPeer && currentPeer.open) {
                    // Now try to connect to the peer again
                    connectToPeer(peerId);
                } else {
                    // If reconnection failed, reinitialize
                    const username = currentUsernameEl.textContent;
                    initializePeer(username);
                }
            }, 3000);
        } catch (e) {
            console.error('Error reconnecting:', e);
            // Reinitialize peer
            const username = currentUsernameEl.textContent;
            initializePeer(username);
        }
        return;
    }

    // If already connected to this peer, don't reconnect
    if (activeConnection && activeConnection.peer === peerId && activeConnection.open) {
        console.log('Already connected to this peer');
        updateConnectionStatus('online');
        return;
    }

    console.log('Attempting to connect to peer:', peerId);
    updateConnectionStatus('connecting');

    try {
        // Connect to the peer with reliable mode and metadata
        const conn = currentPeer.connect(peerId, {
            reliable: true,
            metadata: {
                username: currentUsernameEl.textContent,
                type: 'chat-connection'
            }
        });

        if (!conn) {
            console.error('Failed to create connection object');
            showErrorMessage('Connection failed. Please try again.');
            updateConnectionStatus('offline');
            return;
        }

        // Set a connection timeout
        const connectionTimeout = setTimeout(() => {
            if (!activeConnection || !activeConnection.open) {
                console.warn('Connection attempt timed out');
                showErrorMessage('Connection timed out. The contact may be offline.');
                updateConnectionStatus('offline');
                
                // Clean up the failed connection
                try {
                    if (conn && !conn.open) {
                        conn.close();
                    }
                } catch (e) {
                    console.error('Error closing timed out connection:', e);
                }
            }
        }, 15000); // 15 seconds timeout

        // Handle connection events
        conn.on('open', () => {
            clearTimeout(connectionTimeout);
            console.log('Connection opened successfully');
        });

        conn.on('error', (err) => {
            clearTimeout(connectionTimeout);
            console.error('Connection error:', err);
            showErrorMessage(`Connection error: ${err.message || err}`);
            updateConnectionStatus('offline');
        });

        handleConnection(conn);
    } catch (error) {
        console.error('Error connecting to peer:', error);
        showErrorMessage(`Connection error: ${error.message}`);
        updateConnectionStatus('offline');
        
        // If we get an error about disconnection, try to reinitialize
        if (error.message && (
            error.message.includes('disconnect') || 
            error.message.includes('Cannot connect') ||
            error.message.includes('not connected')
        )) {
            console.log('Detected disconnection error, reinitializing peer...');
            const username = currentUsernameEl.textContent;
            setTimeout(() => {
                initializePeer(username);
            }, 2000);
        }
    }
}

// Handle a peer connection
function handleConnection(conn) {
    // Store the connection
    activeConnection = conn;

    // Set up connection timeout for initial connection
    const connectionOpenTimeout = setTimeout(() => {
        if (conn && !conn.open) {
            console.warn('Connection open event never fired, may be a stale connection');
            // Don't update UI here as we might have another active connection
            try {
                conn.close();
            } catch (e) {
                console.warn('Error closing potentially stale connection:', e);
            }
        }
    }, 15000); // 15 second timeout

    conn.on('open', () => {
        clearTimeout(connectionOpenTimeout);
        console.log('Connection established with', conn.peer);
        updateConnectionStatus('online');
        enableChat();

        // Send a greeting message
        showSystemMessage(`Connected to ${contactUsernameEl.textContent}`);

        // Set up keepalive ping to maintain connection
        // This is especially important for GitHub Pages hosting
        setupConnectionKeepalive(conn);
    });

    conn.on('data', (data) => {
        // Reset connection activity timer on any data received
        if (window.lastConnectionActivity) {
            window.lastConnectionActivity = Date.now();
        }

        try {
            handleIncomingData(data);
        } catch (error) {
            console.error('Error handling incoming data:', error);
            // Don't show error to user for every message processing error
        }
    });

    conn.on('close', () => {
        console.log('Connection closed');
        updateConnectionStatus('offline');
        disableChat();

        // Clear any keepalive interval
        if (window.keepaliveInterval) {
            clearInterval(window.keepaliveInterval);
            window.keepaliveInterval = null;
        }

        // Show a message
        showSystemMessage('Connection closed');

        // Try to reconnect after a delay with exponential backoff
        if (!window.reconnectAttempts) {
            window.reconnectAttempts = 0;
        }

        const backoffTime = Math.min(30000, 2000 * Math.pow(1.5, window.reconnectAttempts));
        window.reconnectAttempts++;

        console.log(`Scheduling reconnection attempt ${window.reconnectAttempts} in ${backoffTime/1000} seconds`);

        setTimeout(() => {
            if (activeContactPeerId) {
                console.log('Attempting to reconnect...');
                showSystemMessage(`Reconnection attempt ${window.reconnectAttempts}...`);
                connectToPeer(activeContactPeerId);
            }
        }, backoffTime);
    });

    conn.on('error', (err) => {
        console.error('Connection error:', err);
        updateConnectionStatus('offline');
        disableChat();

        // Clear any keepalive interval
        if (window.keepaliveInterval) {
            clearInterval(window.keepaliveInterval);
            window.keepaliveInterval = null;
        }

        // Show error message
        let errorMsg = 'Connection error';
        if (err.message) {
            // Clean up error message for display
            errorMsg = err.message.replace(/^Error:\s*/, '');
            // Simplify common WebRTC errors
            if (errorMsg.includes('ICE') || errorMsg.includes('network') ||
                errorMsg.includes('transport') || errorMsg.includes('closed')) {
                errorMsg = 'Network connection issue. This can happen with GitHub Pages hosting.';
            }
        }
        showErrorMessage(errorMsg);

        // Try to reconnect after a delay with exponential backoff
        if (!window.reconnectAttempts) {
            window.reconnectAttempts = 0;
        }

        const backoffTime = Math.min(30000, 2000 * Math.pow(1.5, window.reconnectAttempts));
        window.reconnectAttempts++;

        console.log(`Scheduling reconnection attempt ${window.reconnectAttempts} in ${backoffTime/1000} seconds`);

        setTimeout(() => {
            if (activeContactPeerId) {
                console.log('Attempting to reconnect after error...');
                showSystemMessage(`Reconnection attempt ${window.reconnectAttempts}...`);
                connectToPeer(activeContactPeerId);
            }
        }, backoffTime);
    });
}

// Create typing indicator element
const typingIndicator = document.createElement('div');
typingIndicator.className = 'typing-indicator';
typingIndicator.innerHTML = `
    <div class="typing-bubble">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
    </div>
    <div class="typing-text">${contactUsernameEl.textContent} is typing...</div>
`;
typingIndicator.style.display = 'none';
chatMessagesEl.appendChild(typingIndicator);

// Add CSS for typing indicator
const typingStyle = document.createElement('style');
typingStyle.textContent = `
    .typing-indicator {
        padding: 10px;
        margin: 5px 0;
        display: flex;
        align-items: center;
        align-self: flex-start;
    }

    .typing-bubble {
        display: flex;
        align-items: center;
        background-color: rgba(0, 0, 0, 0.1);
        padding: 8px 12px;
        border-radius: 18px;
        margin-right: 8px;
    }

    .dot {
        height: 8px;
        width: 8px;
        border-radius: 50%;
        background-color: #666;
        margin: 0 2px;
        animation: typing-bubble 1.4s infinite ease-in-out;
    }

    .dot:nth-child(1) { animation-delay: 0s; }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes typing-bubble {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-5px); }
    }

    .typing-text {
        font-size: 0.8rem;
        color: #666;
    }

    .drag-over {
        border: 2px dashed #4A2E6F;
        background-color: rgba(184, 166, 217, 0.1);
    }
`;
document.head.appendChild(typingStyle);

// Handle incoming data
function handleIncomingData(data) {
    console.log('Received data type:', data.type);

    if (data.type === 'message') {
        // Regular text message
        displayMessage(data.content, 'incoming', data.timestamp);
        // Hide typing indicator when message is received
        typingIndicator.style.display = 'none';
    } else if (data.type === 'file-info') {
        // File information before the actual file data
        console.log('Received file info:', data);
        displayFileInfo(data, 'incoming');
        // Hide typing indicator when file is received
        typingIndicator.style.display = 'none';
    } else if (data.type === 'file-data') {
        // File data chunks
        console.log('Received file chunk, size:', data.chunk.byteLength);
        receiveFileChunk(data);
    } else if (data.type === 'file-complete') {
        // File transfer complete
        console.log('File transfer complete:', data.fileId);
        completeFileReceive(data);
    } else if (data.type === 'typing') {
        // Typing indicator
        handleTypingIndicator(data.isTyping);
    } else if (data.type === 'read-receipt') {
        // Read receipt
        handleReadReceipt(data.messageId);
    } else if (data.type === 'ping') {
        // Ping message to check connection - respond with pong
        if (activeConnection && activeConnection.open) {
            try {
                activeConnection.send({
                    type: 'pong',
                    timestamp: Date.now()
                });
                console.log('Ping received, pong sent');
            } catch (error) {
                console.error('Error sending pong:', error);
            }
        }
    } else if (data.type === 'pong') {
        // Pong response - connection is confirmed active
        console.log('Received pong, connection is active');
        // Update connection status to online
        updateConnectionStatus('online');
        // Call the global handler to update lastPongTime
        if (window.handlePongMessage) {
            window.handlePongMessage();
        }
    } else {
        console.warn('Unknown data type received:', data);
    }
}

// Handle typing indicator
function handleTypingIndicator(isTyping) {
    if (isTyping) {
        typingIndicator.style.display = 'flex';
        scrollToBottom();
    } else {
        typingIndicator.style.display = 'none';
    }
}

// Handle read receipt
function handleReadReceipt(messageId) {
    const messageEl = document.getElementById(messageId);
    if (messageEl) {
        const readReceipt = messageEl.querySelector('.read-receipt');
        if (readReceipt) {
            readReceipt.innerHTML = '✓✓';
            readReceipt.style.color = '#4A2E6F';
            readReceipt.title = 'Read';
        }
    }
}

// File transfer variables
let receivingFile = {
    inProgress: false,
    data: [],
    info: null,
    fileId: null,
    receivedSize: 0
};

// Start receiving a file
function receiveFileChunk(data) {
    try {
        if (!receivingFile.inProgress) {
            console.log('Starting new file reception:', data.fileInfo);

            // Validate file info
            if (!data.fileInfo || !data.fileId) {
                throw new Error('Invalid file data received');
            }

            // Check file size limit for GitHub Pages (recommend keeping under 50MB)
            const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
            if (data.fileInfo.size > MAX_FILE_SIZE) {
                throw new Error(`File is too large (${formatFileSize(data.fileInfo.size)}). Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`);
            }

            receivingFile.inProgress = true;
            receivingFile.data = [];
            receivingFile.info = data.fileInfo;
            receivingFile.fileId = data.fileId;
            receivingFile.receivedSize = 0;
            receivingFile.startTime = Date.now();
            receivingFile.lastProgressUpdate = Date.now();

            // Show progress UI
            showFileTransferProgress('Receiving file...', 0);
        }

        // Validate chunk data
        if (!data.chunk || !(data.chunk instanceof ArrayBuffer)) {
            console.warn('Invalid chunk data received:', data.chunk);
            return;
        }

        // Add chunk to received data
        receivingFile.data.push(data.chunk);
        receivingFile.receivedSize += data.chunk.byteLength;

        // Update progress
        const progress = Math.floor((receivingFile.receivedSize / receivingFile.info.size) * 100);

        // Only update UI every 100ms to avoid performance issues
        const now = Date.now();
        if (now - receivingFile.lastProgressUpdate > 100 || progress === 100) {
            receivingFile.lastProgressUpdate = now;

            console.log(`File reception progress: ${progress}% (${receivingFile.receivedSize}/${receivingFile.info.size} bytes)`);
            updateFileTransferProgress(progress);

            // Calculate and show transfer speed
            const elapsedSeconds = (now - receivingFile.startTime) / 1000;
            if (elapsedSeconds > 0) {
                const bytesPerSecond = receivingFile.receivedSize / elapsedSeconds;
                const speedText = formatFileSize(bytesPerSecond) + '/s';
                document.getElementById('progressText').textContent = `${progress}% (${speedText})`;
            }
        }
    } catch (error) {
        console.error('Error processing file chunk:', error);
        showErrorMessage('Error processing file chunk: ' + error.message);

        // Reset file reception state on error
        receivingFile.inProgress = false;
        receivingFile.data = [];
        receivingFile.info = null;
        receivingFile.fileId = null;
        receivingFile.receivedSize = 0;
        receivingFile.startTime = null;
        receivingFile.lastProgressUpdate = null;

        // Hide progress UI
        hideFileTransferProgress();
    }
}

// Complete file reception
function completeFileReceive(data) {
    console.log('Completing file reception for fileId:', data.fileId);

    if (!receivingFile.inProgress) {
        console.warn('No file reception in progress when complete signal received');
        return;
    }

    // Validate that we have the necessary data
    if (!receivingFile.info || !receivingFile.data.length) {
        console.error('Missing file info or data for reception completion');
        showErrorMessage('Error: Missing file data');
        hideFileTransferProgress();

        // Reset file reception state
        receivingFile.inProgress = false;
        receivingFile.data = [];
        receivingFile.info = null;
        receivingFile.fileId = null;
        receivingFile.receivedSize = 0;
        receivingFile.startTime = null;
        receivingFile.lastProgressUpdate = null;
        return;
    }

    try {
        // Store the file name and type before creating the blob
        const fileName = receivingFile.info.name;
        const fileType = receivingFile.info.type;
        const fileId = data.fileId;

        // Combine all chunks
        console.log(`Creating blob from ${receivingFile.data.length} chunks, total size: ${receivingFile.receivedSize} bytes`);

        // Use try-catch specifically for blob creation which can fail in some browsers
        let fileBlob;
        try {
            fileBlob = new Blob(receivingFile.data, { type: fileType });
            console.log('File blob created, size:', fileBlob.size);

            // Verify the blob size matches expected size
            if (Math.abs(fileBlob.size - receivingFile.info.size) > 100) { // Allow small difference due to encoding
                console.warn(`File size mismatch: expected ${receivingFile.info.size}, got ${fileBlob.size}`);
            }
        } catch (blobError) {
            console.error('Error creating blob:', blobError);

            // Try alternative approach for older browsers
            try {
                const BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder;
                if (BlobBuilder) {
                    const bb = new BlobBuilder();
                    for (const chunk of receivingFile.data) {
                        bb.append(chunk);
                    }
                    fileBlob = bb.getBlob(fileType);
                    console.log('File blob created using BlobBuilder, size:', fileBlob.size);
                } else {
                    throw new Error('Blob creation not supported in this browser');
                }
            } catch (fallbackError) {
                throw new Error(`Failed to create file: ${blobError.message}. Fallback also failed: ${fallbackError.message}`);
            }
        }

        // Store the blob in a global variable to prevent garbage collection
        if (!window.receivedFiles) {
            window.receivedFiles = {};
        }
        window.receivedFiles[fileId] = {
            blob: fileBlob,
            name: fileName,
            type: fileType,
            size: fileBlob.size,
            timestamp: Date.now()
        };

        // Update the file message with download link
        const fileMessageEl = document.getElementById(`file-${fileId}`);
        if (fileMessageEl) {
            console.log('Found file message element, enabling download button');
            const downloadBtn = fileMessageEl.querySelector('.download-btn');
            if (downloadBtn) {
                downloadBtn.disabled = false;
                downloadBtn.onclick = function() {
                    // Get the stored file data
                    const fileData = window.receivedFiles[fileId];
                    if (!fileData) {
                        console.error('File data not found for ID:', fileId);
                        showErrorMessage('File data not found. Please try receiving the file again.');
                        return;
                    }

                    try {
                        // Create download link
                        const url = URL.createObjectURL(fileData.blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = fileData.name;
                        document.body.appendChild(a);
                        a.click();

                        // Clean up
                        setTimeout(() => {
                            document.body.removeChild(a);

                            // Don't revoke URL if it's an image (we'll use it for preview)
                            if (!fileData.type.startsWith('image/')) {
                                URL.revokeObjectURL(url);
                            } else {
                                // Add image preview
                                addImagePreview(fileMessageEl, url, fileData.name);
                            }
                        }, 100);
                    } catch (downloadError) {
                        console.error('Error downloading file:', downloadError);
                        showErrorMessage(`Error downloading file: ${downloadError.message}`);

                        // Try alternative download method for GitHub Pages
                        try {
                            const reader = new FileReader();
                            reader.onload = function(e) {
                                const a = document.createElement('a');
                                a.href = e.target.result;
                                a.download = fileData.name;
                                a.style.display = 'none';
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                            };
                            reader.readAsDataURL(fileData.blob);
                        } catch (altError) {
                            console.error('Alternative download method failed:', altError);
                            showErrorMessage('Download failed. Try again or ask the sender to resend the file.');
                        }
                    }
                };
            }

            // If it's an image, try to add preview immediately
            if (fileType.startsWith('image/') && fileBlob.size < 5 * 1024 * 1024) { // Only for images under 5MB
                try {
                    const url = URL.createObjectURL(fileBlob);
                    addImagePreview(fileMessageEl, url, fileName);
                } catch (previewError) {
                    console.warn('Could not create image preview:', previewError);
                }
            }
        }

        // Calculate and show transfer stats
        const totalTime = (Date.now() - receivingFile.startTime) / 1000;
        const avgSpeed = formatFileSize(receivingFile.info.size / totalTime) + '/s';
        console.log(`File transfer completed in ${totalTime.toFixed(1)}s at ${avgSpeed}`);

        // Reset file reception state
        receivingFile.inProgress = false;
        receivingFile.data = [];
        receivingFile.info = null;
        receivingFile.fileId = null;
        receivingFile.receivedSize = 0;
        receivingFile.startTime = null;
        receivingFile.lastProgressUpdate = null;

        // Hide progress UI
        hideFileTransferProgress();

        // Send a system message
        showSystemMessage(`File "${fileName}" received (${formatFileSize(fileBlob.size)})`);

        // Send read receipt for the file
        if (activeConnection && activeConnection.open) {
            try {
                activeConnection.send({
                    type: 'read-receipt',
                    messageId: `file-${fileId}`,
                    timestamp: Date.now()
                });
            } catch (receiptError) {
                console.warn('Could not send read receipt:', receiptError);
            }
        }
    } catch (error) {
        console.error('Error completing file reception:', error);
        showErrorMessage('Error completing file reception: ' + error.message);
        hideFileTransferProgress();

        // Reset file reception state
        receivingFile.inProgress = false;
        receivingFile.data = [];
        receivingFile.info = null;
        receivingFile.fileId = null;
        receivingFile.receivedSize = 0;
        receivingFile.startTime = null;
        receivingFile.lastProgressUpdate = null;
    }
}

// Add image preview to file message
function addImagePreview(messageEl, url, fileName) {
    // Check if preview already exists
    if (messageEl.querySelector('.image-preview')) {
        return;
    }

    const previewEl = document.createElement('div');
    previewEl.className = 'image-preview';
    previewEl.innerHTML = `
        <img src="${url}" alt="${fileName}" title="${fileName}">
    `;

    const messageContent = messageEl.querySelector('.message-content');
    messageContent.appendChild(previewEl);

    // Add CSS for image preview
    const style = document.createElement('style');
    style.textContent = `
        .image-preview {
            margin-top: 10px;
            max-width: 100%;
            overflow: hidden;
            border-radius: 8px;
        }
        
        .image-preview img {
            max-width: 100%;
            max-height: 300px;
            border-radius: 8px;
            object-fit: contain;
        }
    `;
    document.head.appendChild(style);
}

// Send a message
function sendMessage(message) {
    if (!activeConnection || !activeConnection.open) {
        showErrorMessage('No active connection to send message');
        return;
    }

    // Generate a unique message ID
    const messageId = `msg-${Date.now()}`;

    // Display message in chat
    displayMessage(message, 'outgoing', Date.now(), messageId);

    // Send message to peer
    activeConnection.send({
        type: 'message',
        content: message,
        timestamp: Date.now(),
        messageId: messageId
    });

    // Clear input
    messageInput.value = '';

    // Send stopped typing indicator
    activeConnection.send({
        type: 'typing',
        isTyping: false
    });
}

// Display a message in the chat
function displayMessage(message, messageType, timestamp, messageId = null) {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${messageType}`;
    if (messageId) {
        messageEl.id = messageId;
    }

    const formattedTimestamp = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();

    messageEl.innerHTML = `
        <div class="message-header">
            <span>${messageType === 'outgoing' ? 'You' : contactUsernameEl.textContent}</span>
            <span>${formattedTimestamp}</span>
        </div>
        <div class="message-content">
            <p>${formatMessageText(message)}</p>
            ${messageType === 'outgoing' ? '<span class="read-receipt" title="Sent">✓</span>' : ''}
        </div>
    `;

    chatMessagesEl.appendChild(messageEl);
    scrollToBottom();

    // If it's an incoming message, send a read receipt
    if (messageType === 'incoming' && messageId && activeConnection && activeConnection.open) {
        activeConnection.send({
            type: 'read-receipt',
            messageId: messageId,
            timestamp: Date.now()
        });
    }
}

// Format message text with links and emojis
function formatMessageText(text) {
    // Convert URLs to clickable links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    text = text.replace(urlRegex, url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);

    // Convert basic emoticons to emojis
    const emoticonMap = {
        ':)': '😊',
        ':-)': '😊',
        ':(': '😞',
        ':-(': '😞',
        ';)': '😉',
        ';-)': '😉',
        ':D': '😃',
        ':-D': '😃',
        ':P': '😛',
        ':-P': '😛',
        '<3': '❤️'
    };

    for (const [emoticon, emoji] of Object.entries(emoticonMap)) {
        text = text.replace(new RegExp(escapeRegExp(emoticon), 'g'), emoji);
    }

    return text;
}

// Escape special characters for use in regex
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Show a system message in the chat
function showSystemMessage(message) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message system';
    messageEl.innerHTML = `
        <div class="message-content">
            <p>${message}</p>
        </div>
    `;

    chatMessagesEl.appendChild(messageEl);
    scrollToBottom();
}

// Show an error message in the chat
function showErrorMessage(message) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message error';
    messageEl.innerHTML = `
        <div class="message-content">
            <p>⚠️ ${message}</p>
        </div>
    `;

    chatMessagesEl.appendChild(messageEl);
    scrollToBottom();
}

// Update connection status
function updateConnectionStatus(status) {
    connectionStatusEl.className = `status ${status}`;

    switch (status) {
        case 'online':
            connectionStatusEl.textContent = 'Online';
            enableChat();
            break;
        case 'offline':
            connectionStatusEl.textContent = 'Offline';
            disableChat();
            break;
        case 'connecting':
            connectionStatusEl.textContent = 'Connecting...';
            disableChat();
            break;
    }
}

// Set up keepalive pings to maintain connection
// This is especially important for GitHub Pages hosting
function setupConnectionKeepalive(conn) {
    // Clear any existing interval
    if (window.keepaliveInterval) {
        clearInterval(window.keepaliveInterval);
    }

    // Initialize last activity timestamp
    window.lastConnectionActivity = Date.now();
    window.lastPongTime = Date.now();

    // Set up handler for pong responses
    window.handlePongMessage = function() {
        window.lastPongTime = Date.now();
    };

    // Send ping every 15 seconds to keep connection alive
    window.keepaliveInterval = setInterval(() => {
        if (conn && conn.open) {
            try {
                // Send ping message
                conn.send({
                    type: 'ping',
                    timestamp: Date.now()
                });
                console.log('Ping sent');

                // Check if we've received a pong recently
                const pongTimeout = 30000; // 30 seconds
                if (Date.now() - window.lastPongTime > pongTimeout) {
                    console.warn('No pong received for 30 seconds, connection may be dead');
                    updateConnectionStatus('connecting');
                    showSystemMessage('Connection seems inactive. Checking status...');

                    // After another 15 seconds, if still no pong, consider connection dead
                    setTimeout(() => {
                        if (Date.now() - window.lastPongTime > pongTimeout + 15000) {
                            console.error('Connection appears to be dead, forcing reconnect');
                            updateConnectionStatus('offline');

                            // Force close and reconnect
                            try {
                                conn.close();
                            } catch (e) {
                                console.warn('Error closing dead connection:', e);
                            }

                            // Reset reconnect attempts to start fresh
                            window.reconnectAttempts = 0;

                            // Try to reconnect
                            if (activeContactPeerId) {
                                showSystemMessage('Connection lost. Reconnecting...');
                                setTimeout(() => {
                                    connectToPeer(activeContactPeerId);
                                }, 1000);
                            }
                        }
                    }, 15000);
                }
            } catch (error) {
                console.error('Error sending keepalive ping:', error);
            }
        } else {
            // Clear interval if connection is closed
            clearInterval(window.keepaliveInterval);
            window.keepaliveInterval = null;
        }
    }, 15000); // 15 seconds
}

// Enable chat input
function enableChat() {
    messageInput.disabled = false;
    sendBtn.disabled = false;
    fileUpload.disabled = false;
    messageInput.placeholder = 'Type a message...';
}

// Disable chat input
function disableChat() {
    messageInput.disabled = true;
    sendBtn.disabled = true;
    fileUpload.disabled = true;
    messageInput.placeholder = 'Waiting for connection...';
}

// Scroll to bottom of chat
function scrollToBottom() {
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

// Send a file
function sendFile(file) {
    if (!activeConnection || !activeConnection.open) {
        showErrorMessage('No active connection to send file');
        return;
    }

    // Check file size limit for GitHub Pages (recommend keeping under 50MB)
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_FILE_SIZE) {
        showErrorMessage(`File is too large (${formatFileSize(file.size)}). Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`);
        return;
    }

    console.log('Starting file send process for:', file.name, 'size:', file.size, 'type:', file.type);

    // Generate a unique file ID with random component to avoid collisions
    const fileId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);

    // Display file in chat
    displayFileInfo({
        fileId,
        name: file.name,
        size: file.size,
        type: file.type,
        _file: file,  // Store the file object for local downloads
        timestamp: Date.now()
    }, 'outgoing');

    // Send file info to peer
    console.log('Sending file-info to peer');
    try {
        activeConnection.send({
            type: 'file-info',
            fileId,
            name: file.name,
            size: file.size,
            type: file.type,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('Error sending file info:', error);
        showErrorMessage(`Failed to initiate file transfer: ${error.message}`);
        return;
    }

    // Show progress UI
    showFileTransferProgress('Sending file...', 0);

    // Add a small delay to ensure the file-info message is processed first
    setTimeout(() => {
        // Optimize chunk size based on file size
        // Smaller files use smaller chunks for faster transfer start
        // Larger files use larger chunks for better throughput
        let chunkSize;
        if (file.size < 1024 * 1024) { // < 1MB
            chunkSize = 8192; // 8KB chunks
        } else if (file.size < 5 * 1024 * 1024) { // < 5MB
            chunkSize = 16384; // 16KB chunks
        } else {
            chunkSize = 32768; // 32KB chunks
        }

        const reader = new FileReader();
        let offset = 0;
        let chunkCount = 0;
        let lastProgressUpdate = Date.now();
        let transferStartTime = Date.now();
        let transferFailed = false;

        reader.onload = (e) => {
            if (!activeConnection || !activeConnection.open) {
                if (!transferFailed) {
                    transferFailed = true;
                    hideFileTransferProgress();
                    showErrorMessage('Connection closed while sending file');
                }
                return;
            }

            try {
                // Send chunk
                console.log(`Sending chunk ${chunkCount++}, size: ${e.target.result.byteLength} bytes`);
                activeConnection.send({
                    type: 'file-data',
                    fileId,
                    fileInfo: {
                        name: file.name,
                        size: file.size,
                        type: file.type
                    },
                    chunk: e.target.result
                });

                // Update progress
                offset += e.target.result.byteLength;
                const progress = Math.floor((offset / file.size) * 100);

                // Only update UI every 100ms to avoid performance issues
                const now = Date.now();
                if (now - lastProgressUpdate > 100 || progress === 100) {
                    lastProgressUpdate = now;
                    updateFileTransferProgress(progress);

                    // Calculate and show transfer speed
                    const elapsedSeconds = (now - transferStartTime) / 1000;
                    if (elapsedSeconds > 0) {
                        const bytesPerSecond = offset / elapsedSeconds;
                        const speedText = formatFileSize(bytesPerSecond) + '/s';
                        document.getElementById('progressText').textContent = `${progress}% (${speedText})`;
                    }
                }

                // Continue with next chunk or complete
                if (offset < file.size) {
                    // Adaptive delay based on connection quality
                    // If we're sending quickly, reduce delay to improve speed
                    const chunkDelay = chunkCount % 10 === 0 ? 50 : 10; // Longer pause every 10 chunks
                    setTimeout(readNextChunk, chunkDelay);
                } else {
                    console.log('File sending complete, waiting before sending completion message');
                    // Add a small delay before sending completion message to ensure all chunks are processed
                    setTimeout(() => {
                        if (activeConnection && activeConnection.open) {
                            console.log('Sending file-complete message');
                            try {
                                activeConnection.send({
                                    type: 'file-complete',
                                    fileId,
                                    timestamp: Date.now()
                                });

                                // Enable download button for sender too
                                const fileMessageEl = document.getElementById(`file-${fileId}`);
                                if (fileMessageEl) {
                                    const downloadBtn = fileMessageEl.querySelector('.download-btn');
                                    if (downloadBtn) {
                                        downloadBtn.disabled = false;
                                        downloadBtn.onclick = () => {
                                            // Create download link
                                            const url = URL.createObjectURL(file);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = file.name;
                                            document.body.appendChild(a);
                                            a.click();
                                            document.body.removeChild(a);

                                            // Don't revoke URL if it's an image (we'll use it for preview)
                                            if (!file.type.startsWith('image/')) {
                                                URL.revokeObjectURL(url);
                                            } else {
                                                // Add image preview
                                                addImagePreview(fileMessageEl, url, file.name);
                                            }
                                        };
                                    }
                                }

                                // Add a success message
                                showSystemMessage(`File "${file.name}" sent successfully`);

                                // Calculate and show transfer stats
                                const totalTime = (Date.now() - transferStartTime) / 1000;
                                const avgSpeed = formatFileSize(file.size / totalTime) + '/s';
                                console.log(`File transfer completed in ${totalTime.toFixed(1)}s at ${avgSpeed}`);
                            } catch (error) {
                                console.error('Error sending file completion message:', error);
                                showErrorMessage(`File sent but completion notification failed: ${error.message}`);
                            }
                        } else {
                            showErrorMessage('Connection closed before file transfer could complete');
                        }

                        // Hide progress UI
                        hideFileTransferProgress();
                    }, 1000); // Wait 1 second before sending completion message
                }
            } catch (error) {
                console.error('Error sending file chunk:', error);
                if (!transferFailed) {
                    transferFailed = true;
                    hideFileTransferProgress();
                    showErrorMessage(`Error sending file: ${error.message}`);
                }
            }
        };

        reader.onerror = (error) => {
            console.error('Error reading file:', error);
            if (!transferFailed) {
                transferFailed = true;
                hideFileTransferProgress();
                showErrorMessage('Error reading file');
            }
        };

        function readNextChunk() {
            if (transferFailed || !activeConnection || !activeConnection.open) {
                return;
            }

            try {
                const slice = file.slice(offset, offset + chunkSize);
                reader.readAsArrayBuffer(slice);
            } catch (error) {
                console.error('Error reading file chunk:', error);
                transferFailed = true;
                hideFileTransferProgress();
                showErrorMessage(`Error reading file chunk: ${error.message}`);
            }
        }

        // Start reading
        readNextChunk();
    }, 500);
}

// Show file transfer progress UI
function showFileTransferProgress(title, progress) {
    fileTransferTitle.textContent = title;
    progressBar.style.width = `${progress}%`;
    progressText.textContent = `${progress}%`;
    fileTransferProgress.style.display = 'block';
}

// Update file transfer progress
function updateFileTransferProgress(progress) {
    progressBar.style.width = `${progress}%`;
    progressText.textContent = `${progress}%`;
}

// Hide file transfer progress UI
function hideFileTransferProgress() {
    fileTransferProgress.style.display = 'none';
}

// Display a file message in the chat
function displayFileInfo(fileData, messageType) {
    console.log('Displaying file info in chat:', fileData);

    // Check if this file message already exists
    const existingEl = document.getElementById(`file-${fileData.fileId}`);
    if (existingEl) {
        console.log('File message already exists, not creating duplicate');
        return;
    }

    const messageEl = document.createElement('div');
    messageEl.className = `message ${messageType}`;
    messageEl.id = `file-${fileData.fileId}`;

    const timestamp = fileData.timestamp ? new Date(fileData.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();

    // Format file size
    const formattedSize = formatFileSize(fileData.size);

    // Get appropriate file icon based on file type
    const fileIcon = getFileIcon(fileData.type, fileData.name);

    messageEl.innerHTML = `
        <div class="message-header">
            <span>${messageType === 'outgoing' ? 'You' : contactUsernameEl.textContent}</span>
            <span>${timestamp}</span>
        </div>
        <div class="message-content file-message">
            <div class="file-info">
                <div class="file-icon">${fileIcon}</div>
                <div class="file-details">
                    <p class="file-name">${fileData.name}</p>
                    <p class="file-size">${formattedSize}</p>
                </div>
                <button class="download-btn" ${messageType === 'outgoing' ? '' : 'disabled'}>
                    <span class="btn-icon">⬇️</span>
                    <span class="btn-text">Download</span>
                </button>
            </div>
        </div>
    `;

    chatMessagesEl.appendChild(messageEl);
    scrollToBottom();

    console.log(`File message created with ID: file-${fileData.fileId}`);

    // If it's an outgoing message, enable the download button immediately
    if (messageType === 'outgoing' && fileData._file) {
        // Store the file in the global storage for later access
        if (!window.receivedFiles) {
            window.receivedFiles = {};
        }
        window.receivedFiles[fileData.fileId] = {
            blob: fileData._file,
            name: fileData.name,
            type: fileData.type
        };

        const downloadBtn = messageEl.querySelector('.download-btn');
        if (downloadBtn) {
            downloadBtn.onclick = function() {
                // Get the stored file data
                const fileData = window.receivedFiles[this.closest('.message').id.replace('file-', '')];
                if (!fileData) {
                    console.error('File data not found');
                    showErrorMessage('File data not found. Please try again.');
                    return;
                }

                // Create a download link for the local file
                const url = URL.createObjectURL(fileData.blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileData.name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                // Don't revoke URL if it's an image (we'll use it for preview)
                if (!fileData.type.startsWith('image/')) {
                    URL.revokeObjectURL(url);
                } else {
                    // Add image preview
                    addImagePreview(this.closest('.message'), url, fileData.name);
                }
            };
        }
    }
}

// Get appropriate file icon based on file type
function getFileIcon(fileType, fileName) {
    if (fileType.startsWith('image/')) {
        return '🖼️';
    } else if (fileType.startsWith('video/')) {
        return '🎬';
    } else if (fileType.startsWith('audio/')) {
        return '🎵';
    } else if (fileType === 'application/pdf') {
        return '📄';
    } else if (fileType.includes('word') || fileName.endsWith('.doc') || fileName.endsWith('.docx')) {
        return '📝';
    } else if (fileType.includes('excel') || fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) {
        return '📊';
    } else if (fileType.includes('powerpoint') || fileName.endsWith('.ppt') || fileName.endsWith('.pptx')) {
        return '📽️';
    } else if (fileType.includes('zip') || fileType.includes('rar') || fileType.includes('tar') || fileType.includes('7z')) {
        return '🗜️';
    } else {
        return '📁';
    }
}

// Format file size
function formatFileSize(bytes) {
    if (bytes < 1024) {
        return bytes + ' B';
    } else if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(1) + ' KB';
    } else if (bytes < 1024 * 1024 * 1024) {
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    } else {
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }
}

// Set up event listeners
function setupEventListeners() {
    // Send message on form submit
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = messageInput.value.trim();
        if (message) {
            sendMessage(message);
        }
    });

    // Handle typing indicator
    let typingTimeout;
    messageInput.addEventListener('input', () => {
        if (activeConnection && activeConnection.open) {
            // Send typing indicator
            try {
                activeConnection.send({
                    type: 'typing',
                    isTyping: true
                });

                // Clear previous timeout
                clearTimeout(typingTimeout);

                // Set timeout to send stopped typing after 2 seconds of inactivity
                typingTimeout = setTimeout(() => {
                    if (activeConnection && activeConnection.open) {
                        activeConnection.send({
                            type: 'typing',
                            isTyping: false
                        });
                    }
                }, 2000);
            } catch (error) {
                console.warn('Error sending typing indicator:', error);
                // Don't show error to user as this is non-critical
            }
        }
    });

    // Handle file upload button click - make it work even when the input is disabled
    const fileUploadBtn = document.querySelector('.file-upload-btn');
    if (fileUploadBtn) {
        fileUploadBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Only trigger file selection if we have an active connection
            if (activeConnection && activeConnection.open) {
                fileUpload.click();
            } else {
                showErrorMessage('Cannot send files: No active connection');
            }
        });
    }

    // Handle file upload
    fileUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            // Check if connection is still active
            if (activeConnection && activeConnection.open) {
                // Validate file before sending
                if (validateFileForTransfer(file)) {
                    sendFile(file);
                }
            } else {
                showErrorMessage('Cannot send file: Connection lost');
            }
            // Reset file input
            fileUpload.value = '';
        }
    });

    // Back to contacts button
    backToContactsBtn.addEventListener('click', () => {
        // Clean up before navigating away
        cleanupBeforeNavigation();
        window.location.href = '../Conncetions Page/connections.html';
    });

    // Logout button
    logoutBtn.addEventListener('click', () => {
        // Show loading screen before logout
        if (window.Loader) {
            Loader.show();
        }

        // Clean up connections
        cleanupBeforeNavigation();

        // Clear any session storage data
        sessionStorage.clear();

        // Sign out from Firebase
        firebase.auth().signOut().then(() => {
            // Redirect to the main index page which will handle the redirection
            window.location.href = '../index.html';
        }).catch((error) => {
            console.error('Error signing out:', error);
            if (window.Loader) {
                Loader.hide();
            }
        });
    });

    // Add drag and drop file upload with better error handling for GitHub Pages
    chatMessagesEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        // Only show drag effect if we have an active connection
        if (activeConnection && activeConnection.open) {
            chatMessagesEl.classList.add('drag-over');
        }
    });

    chatMessagesEl.addEventListener('dragleave', () => {
        chatMessagesEl.classList.remove('drag-over');
    });

    chatMessagesEl.addEventListener('drop', (e) => {
        e.preventDefault();
        chatMessagesEl.classList.remove('drag-over');

        // Check if connection is active before accepting files
        if (!activeConnection || !activeConnection.open) {
            showErrorMessage('Cannot send files: No active connection');
            return;
        }

        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (validateFileForTransfer(file)) {
                sendFile(file);
            }
        }
    });

    // Add window beforeunload event to clean up resources
    window.addEventListener('beforeunload', cleanupBeforeNavigation);

    // Add visibility change handler to manage connection when tab is hidden/visible
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            console.log('Tab is now visible, checking connection status');
            // Check connection status when tab becomes visible again
            if (activeConnection && !activeConnection.open) {
                updateConnectionStatus('offline');
                showSystemMessage('Connection lost while tab was inactive. Attempting to reconnect...');

                // Try to reconnect
                if (activeContactPeerId) {
                    setTimeout(() => {
                        connectToPeer(activeContactPeerId);
                    }, 1000);
                }
            }
        }
    });
}

// Validate file before transfer
function validateFileForTransfer(file) {
    // Check file size limit for GitHub Pages (recommend keeping under 50MB)
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_FILE_SIZE) {
        showErrorMessage(`File is too large (${formatFileSize(file.size)}). Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`);
        return false;
    }

    // Check for zero-byte files
    if (file.size === 0) {
        showErrorMessage('Cannot send empty file');
        return false;
    }

    // Check for file name issues
    if (!file.name || file.name.length > 255) {
        showErrorMessage('Invalid file name');
        return false;
    }

    return true;
}

// Clean up connections and resources before navigating away
function cleanupBeforeNavigation() {
    console.log('Cleaning up before navigation');

    // Close peer connection if exists
    if (currentPeer) {
        try {
            currentPeer.destroy();
        } catch (e) {
            console.warn('Error destroying peer:', e);
        }
        currentPeer = null;
    }

    // Close active connection if exists
    if (activeConnection && activeConnection.open) {
        try {
            activeConnection.close();
        } catch (e) {
            console.warn('Error closing connection:', e);
        }
        activeConnection = null;
    }

    // Clean up any file transfer in progress
    if (receivingFile.inProgress) {
        receivingFile.inProgress = false;
        receivingFile.data = [];
        receivingFile.info = null;
        receivingFile.fileId = null;
        receivingFile.receivedSize = 0;
        receivingFile.startTime = null;
        receivingFile.lastProgressUpdate = null;
    }

    // Hide any progress UI
    hideFileTransferProgress();

    // Revoke any object URLs to prevent memory leaks
    if (window.receivedFiles) {
        for (const fileId in window.receivedFiles) {
            try {
                URL.revokeObjectURL(window.receivedFiles[fileId].url);
            } catch (e) {
                // Ignore errors here
            }
        }
    }
}

// Check connection status and reconnect if needed
function checkConnectionStatus() {
    if (currentPeer && currentPeer.open && activeContactPeerId) {
        if (!activeConnection || !activeConnection.open) {
            console.log('Connection check: No active connection, attempting to reconnect...');
            connectToPeer(activeContactPeerId);
        }
    }
}

// Set up periodic connection check
setInterval(checkConnectionStatus, 15000); // Check every 15 seconds

// Periodically check connection status and attempt reconnection if needed
function startConnectionMonitoring() {
    const PEER_CHECK_INTERVAL = 20000; // 20 seconds
    const CONNECTION_CHECK_INTERVAL = 10000; // 10 seconds
    let lastPingTime = 0;
    let lastPongTime = 0;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;

    // Monitor PeerJS server connection
    setInterval(() => {
        if (!currentPeer) {
            console.log('Connection monitoring: No peer object, initializing...');
            const username = currentUsernameEl.textContent;
            initializePeer(username);
            reconnectAttempts = 0;
            return;
        }

        if (!currentPeer.open) {
            console.log('Connection monitoring: Peer not connected to server');
            reconnectAttempts++;

            if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
                console.log(`Connection monitoring: Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                try {
                    currentPeer.reconnect();
                } catch (e) {
                    console.error('Error during reconnect:', e);
                }
            } else {
                console.log('Connection monitoring: Max reconnect attempts reached, reinitializing peer...');
                const username = currentUsernameEl.textContent;
                const tempPeer = currentPeer;
                currentPeer = null;
                try {
                    tempPeer.destroy();
                } catch (e) {
                    console.log('Error destroying peer during monitoring:', e);
                }
                initializePeer(username);
                reconnectAttempts = 0;
            }
        } else {
            reconnectAttempts = 0;
        }
    }, PEER_CHECK_INTERVAL);

    // Monitor peer-to-peer connection
    setInterval(() => {
        if (currentPeer && currentPeer.open && activeContactPeerId) {
            // If we have a peer but no active connection, try to reconnect
            if (!activeConnection || !activeConnection.open) {
                console.log('Connection monitoring: No active connection, attempting to reconnect...');
                connectToPeer(activeContactPeerId);
            } else {
                // Send a ping to verify the connection is truly active
                const now = Date.now();

                // Only send a ping if we haven't received a pong in the last interval
                if (now - lastPongTime > CONNECTION_CHECK_INTERVAL) {
                    try {
                        activeConnection.send({
                            type: 'ping',
                            timestamp: now
                        });
                        lastPingTime = now;
                        console.log('Connection monitoring: Ping sent');
                    } catch (error) {
                        console.error('Connection monitoring: Error sending ping, reconnecting...', error);

                        // Close the problematic connection
                        try {
                            activeConnection.close();
                        } catch (e) {
                            console.error('Error closing connection:', e);
                        }
                        activeConnection = null;

                        // Try to reconnect
                        connectToPeer(activeContactPeerId);
                    }

                    // If we haven't received a pong since our last ping and it's been a while
                    if (lastPingTime > lastPongTime && now - lastPingTime > CONNECTION_CHECK_INTERVAL * 2) {
                        console.log('Connection monitoring: No pong received, connection may be dead');
                        updateConnectionStatus('connecting');

                        // Close the problematic connection
                        try {
                            if (activeConnection) {
                                activeConnection.close();
                                activeConnection = null;
                            }
                        } catch (e) {
                            console.error('Error closing stale connection:', e);
                        }

                        // Try to reconnect
                        connectToPeer(activeContactPeerId);
                    }
                }
            }
        }
    }, CONNECTION_CHECK_INTERVAL);

    // Add a handler for pong messages to update lastPongTime
    window.handlePongMessage = function() {
        lastPongTime = Date.now();
        console.log('Connection monitoring: Pong received');
    };
}

// Start connection monitoring when the app initializes
document.addEventListener('DOMContentLoaded', () => {
    startConnectionMonitoring();
});

// Clean up when leaving the page
window.addEventListener('beforeunload', () => {
    if (currentPeer) {
        currentPeer.destroy();
    }
});
