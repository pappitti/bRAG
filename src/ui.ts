// src/ui.ts
import { AppState } from './state';
import { AppState as AppStateType, ChatMessage, Chunk, SearchResult, StreamResponse} from './types';
import { renderMarkdown, processResponse, showTooltip, hideTooltip } from './utils';

// --- DOM Element References ---
const messageList = document.getElementById('message-list')!;
const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
const sendButton = document.getElementById('send-button') as HTMLButtonElement;
const reuseChunksCheckbox = document.getElementById('reuse-chunks-checkbox') as HTMLInputElement;
const togglePanelButton = document.getElementById('toggle-panel-button') as HTMLButtonElement;
const closePanelButton = document.getElementById('close-panel-button') as HTMLButtonElement;
const rightPanel = document.getElementById('right-panel')!;
const searchStatusSpan = document.getElementById('search-status')!;
const llmStatusSpan = document.getElementById('llm-status')!;
const currentTaskSpan = document.getElementById('current-task')!;
const paramToggle = document.getElementById('toggle-status-button')!;
const paramSection = document.getElementById('status-params')!;
const searchEndpointInput = document.getElementById('search-endpoint-input') as HTMLInputElement;
const llmEndpointInput = document.getElementById('llm-endpoint-input') as HTMLInputElement;
const updateEndpointsButton = document.getElementById('update-endpoints-button') as HTMLButtonElement;
const statusErrorDiv = document.getElementById('status-error')!;
const chunkListDiv = document.getElementById('chunk-list')!;

// --- UI Update Functions ---

function renderChatMessages(messages: ChatMessage[]) {

    messageList.innerHTML = ''; // Clear existing messages

    messages.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.classList.add('message', msg.role);

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('content');
        contentDiv.innerHTML = msg.content; 

        // Add citation listeners if it's an assistant message
         if (msg.role === 'assistant') {
             contentDiv.querySelectorAll<HTMLElement>('.citation').forEach(span => {
                 span.addEventListener('click', handleCitationClick);
                 // Basic Tooltip on Hover
                 span.addEventListener('mouseenter', handleCitationMouseEnter);
                 span.addEventListener('mouseleave', hideTooltip);
             });
         }

        msgDiv.appendChild(contentDiv);
        messageList.appendChild(msgDiv);
    });
    // Scroll to the bottom
    messageList.scrollTop = messageList.scrollHeight;
}

function renderStatus(state: AppStateType) {
    searchStatusSpan.textContent = state.searchBackend.status;
    searchStatusSpan.className = `status-${state.searchBackend.status}`; 
    llmStatusSpan.textContent = state.llmBackend.status;
    llmStatusSpan.className = `status-${state.llmBackend.status}`;

    searchEndpointInput.value = state.searchBackend.endpoint;
    llmEndpointInput.value = state.llmBackend.endpoint;

    currentTaskSpan.textContent = state.currentTask || null ;
    currentTaskSpan.className = 'status-idle'

    // Display errors
    let errorMsg = '';
    if (state.searchBackend.status === 'error' && state.searchBackend.error) {
        errorMsg += `Search Error: ${state.searchBackend.error}\n`;
    }
    if (state.llmBackend.status === 'error' && state.llmBackend.error) {
        errorMsg += `LLM Error: ${state.llmBackend.error}`;
    }
    statusErrorDiv.textContent = errorMsg.trim();
    statusErrorDiv.style.display = errorMsg ? 'block' : 'none';

    // Update loading state for input/button
    const isLoading = state.isLoading || state.llmBackend.status === 'streaming' || state.llmBackend.status === 'loading' || state.searchBackend.status === 'loading';
    chatInput.disabled = isLoading;
    sendButton.disabled = isLoading || !chatInput.value.trim();
    sendButton.textContent = isLoading ? 'Processing...' : 'Send';
}

function renderChunks(searchHistory: SearchResult[], chunks: Map<string,Chunk>) {
    const appState = AppState.getInstance();
    chunkListDiv.innerHTML = ''; // Clear previous chunks

    if (searchHistory.length === 0){
        chunkListDiv.innerHTML = '<p>Empty search history.</p>';
        return
    }

    let elementToScrollTo: HTMLElement | null = null; 

    searchHistory.forEach((search, idx) =>{
        const searchItem = document.createElement('div')
        searchItem.classList.add('search-item');
        searchItem.dataset.searchTime = search.time

        const searchHeader = document.createElement('div')
        searchHeader.classList.add('search-item-header');
        searchHeader.innerHTML = `
            <span class="search-item-title" title="${search.time} ">${idx}</span>
            <span class="chunk-item-number">Retrieved chunks: ${search.count.toString()}</span>
        `;

        const expandButton = document.createElement('button');
        expandButton.classList.add('expand-button');
        expandButton.textContent = 'Expand';
        
        searchHeader.appendChild(expandButton);

        searchItem.appendChild(searchHeader)

        const searchChunkList = document.createElement('div');

        if (search.count === 0) {
            searchChunkList.innerHTML = '<p>No chunks retrieved yet.</p>';
        } else {

            const searchChunks = Array.from(chunks.entries())
                .filter(([key]) => search.results.includes(key))

            searchChunks.forEach(([chunkKey, chunk]) => {
                const chunkItem = document.createElement('div');
                chunkItem.classList.add('chunk-item');
                chunkItem.dataset.chunkKey = chunkKey; // Store index for click handling
                if (chunkKey === appState.getState().selectedChunkIndex) {
                    chunkItem.classList.add('expanded');
                    elementToScrollTo = chunkItem;
                }

                const chunkHeader = document.createElement('div');
                chunkHeader.classList.add('chunk-item-header');
                chunkHeader.innerHTML = `
                    <span class="chunk-item-title" title="${chunk.titre} (ID: ${chunk.chunkIndex})">${chunk.titre}</span>
                    <span class="chunk-item-id">ID: ${chunk.chunkIndex}</span>
                    ${chunk.score !== undefined ? `<span class="chunk-item-score">${chunk.score.toFixed(2)}</span>` : ''}
                `;

                const chunkActive = document.createElement('div');
                chunkActive.classList.add('chunk-item-active');
                const chunkActiveCheckbox = document.createElement('input');
                chunkActiveCheckbox.type = 'checkbox';
                chunkActiveCheckbox.checked = chunk.active || false; // Default to false if undefined
                chunkActiveCheckbox.addEventListener('change', () => {
                    appState.updateChunk(
                        chunkKey, 
                        {
                            ...chunk,
                            active: chunkActiveCheckbox.checked,
                        }
                        ); // Update state with modified chunk
                });
                chunkActive.appendChild(chunkActiveCheckbox);
                chunkActive.appendChild(document.createTextNode('Active'));
                chunkHeader.appendChild(chunkActive);

                const content = document.createElement('div');
                content.classList.add('chunk-item-content');

                // Render markdown safely for the preview
                content.innerHTML = renderMarkdown(chunk.contenu); 

                chunkItem.appendChild(chunkHeader);

                if (chunk.previousChunkIndex && chunk.chunkIndex !== chunk.previousChunkIndex) {
                    const chunkViewerPrevButton = document.createElement('button');
                    chunkViewerPrevButton.classList.add('chunk-viewer-prev');
                    chunkViewerPrevButton.textContent = 'View previous';

                    chunkViewerPrevButton.addEventListener('click', async () => {
                        await appState.addBeforeChunk(chunkKey);
                    });

                    chunkItem.appendChild(chunkViewerPrevButton);
                }

                chunkItem.appendChild(content);
                content.addEventListener('click', () => {
                    appState.setSelectedChunkIndex(chunkKey)
                });

                if (chunk.nextChunkIndex && chunk.nextChunkIndex <=(chunk.totalChunks -1)) {
                    const chunkViewerNextButton = document.createElement('button');
                    chunkViewerNextButton.classList.add('chunk-viewer-next');
                    chunkViewerNextButton.textContent = 'View Next';

                    chunkViewerNextButton.addEventListener('click', async () => {
                        await appState.addAfterChunk(chunkKey);
                    });
                    chunkItem.appendChild(chunkViewerNextButton);
                }
    
                searchChunkList.appendChild(chunkItem);
            
            });

            expandButton.addEventListener('click', () => {
                const isExpanded = searchItem.classList.toggle('expanded');
                expandButton.textContent = isExpanded ? 'Collapse' : 'Expand';
                chunkListDiv.scrollTop = searchItem.offsetTop; // Scroll to the expanded item
                
                searchItem.querySelectorAll('.chunk-item').forEach((item) => {
                    item.classList.toggle('expanded', isExpanded);
                }
                );
            });
        }

        searchItem.appendChild(searchChunkList);
        chunkListDiv.appendChild(searchItem);

        if (elementToScrollTo) {
            // Use scrollIntoView for better reliability
            elementToScrollTo.scrollIntoView({
                behavior: 'smooth', // 'smooth' for animation, 'auto' for instant
                block: 'nearest',   // 'start', 'center', 'end', or 'nearest'
            });
        }
    });
}

// --- Event Handlers ---

function handleSendQuery(appState: AppState) { 
    const query = chatInput.value.trim();
    if (!query || appState.getState().isLoading) return;

    appState.setCurrentQuery(query);
    appState.addChatMessage({ role: 'user', content: `<p>${query}</p>` }); 
    chatInput.value = ''; // Clear input
    sendButton.disabled = true; // Disable until response or if input is empty again

    // Trigger the RAG process (defined in main.ts)
     document.dispatchEvent(new CustomEvent('sendquery'));
}

function handleUpdateEndpoints(appState: AppState) {
    const newSearchEndpoint = searchEndpointInput.value.trim();
    const newLlmEndpoint = llmEndpointInput.value.trim();
    appState.setEndpoints(newSearchEndpoint, newLlmEndpoint);
   
    console.log("Endpoints updated in state.");
    statusErrorDiv.textContent = "Endpoints updated."; // Simple feedback
    statusErrorDiv.style.display = 'block';
    setTimeout(() => { statusErrorDiv.style.display = 'none'; }, 3000);
}

function handleCitationClick(event: Event) {
    const target = event.currentTarget as HTMLElement;
    const promptIndexStr = target.dataset.chunkKey;
    if (promptIndexStr) {
        const state = AppState.getInstance().getState();
        const citedChunk = state.chunks.get(promptIndexStr);
        rightPanel.classList.toggle('collapsed', false);

        citedChunk && AppState.getInstance().setSelectedChunkIndex(promptIndexStr);
            
    } else {
    console.warn(`Chunk for citation index ${promptIndexStr} not found in active chunks.`);
    }
}

function handleCitationMouseEnter(event: MouseEvent) {
    const target = event.currentTarget as HTMLElement;
    const promptIndexStr = target.dataset.chunkKey;
    if (promptIndexStr) {
        const state = AppState.getInstance().getState();
        const citedChunk = state.chunks.get(promptIndexStr); 
        if (citedChunk) {
            // Show tooltip with chunk title and beginning of text
            const tooltipText = `Source ${promptIndexStr}: ${citedChunk.titre}\n\n${citedChunk.contenu.substring(0, 150)}${citedChunk.contenu.length > 150 ? '...' : ''}`;
            showTooltip(event, tooltipText);
        }
    }
}


// --- Initialization ---
export function initializeUI(appState: AppState) {
    // Initial Render based on loaded state
    const initialState = appState.getState();
    console.log("Initializing UI with state:", initialState);
    renderChatMessages(initialState.chatHistory);
    renderStatus(initialState);
    renderChunks(initialState.searchHistory, initialState.chunks);
    reuseChunksCheckbox.checked = initialState.reuseChunks;


    // Subscribe to state changes
    appState.subscribe((newState) => {
        console.log("UI received state update");
        renderChatMessages(newState.chatHistory);
        renderStatus(newState);
        renderChunks(newState.searchHistory, newState.chunks);

        // Update checkbox if changed programmatically (less common)
         if (reuseChunksCheckbox.checked !== newState.reuseChunks) {
             reuseChunksCheckbox.checked = newState.reuseChunks;
         }
    });

    // Add Event Listeners
    paramToggle.addEventListener('click', () => {
        paramSection.classList.toggle('collapsed');
    });

    sendButton.addEventListener('click', () => handleSendQuery(appState));
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Prevent newline
            handleSendQuery(appState);
        }
    });
     // Enable send button only when there is text
     chatInput.addEventListener('input', () => {
         sendButton.disabled = appState.getState().isLoading || !chatInput.value.trim();
     });

    updateEndpointsButton.addEventListener('click', () => handleUpdateEndpoints(appState));
    reuseChunksCheckbox.addEventListener('change', (e) => {
        appState.setReuseChunks((e.target as HTMLInputElement).checked);
    });

    togglePanelButton.addEventListener('click', () => {
        rightPanel.classList.toggle('collapsed');
    });
    closePanelButton.addEventListener('click', () => {
        rightPanel.classList.add('collapsed');
    });

    // Initial button state
    sendButton.disabled = !chatInput.value.trim();
}

// --- Specific UI Update Helpers ---

 /* Appends streaming text to the last assistant message, processes markdown/citations */
 export function appendStreamContent(rawChunk: StreamResponse) {
    const state = AppState.getInstance();
    const appState = state.getState();
    const currentHistory = appState.chatHistory;
    const lastMessageIndex = currentHistory.length - 1;

    if (lastMessageIndex < 0 || currentHistory[lastMessageIndex].role !== 'assistant') {
        // Should not happen if an assistant message container was prepared
        console.error("appendStreamContent called without a preceding assistant message.");
        return;
    }

    const updatedRawContent = (currentHistory[lastMessageIndex].rawContent || '') + rawChunk.chunk;
    currentHistory[lastMessageIndex].rawContent = updatedRawContent;

    // Update the specific message element directly for better performance than re-rendering all
    const messageElements = messageList.querySelectorAll('.message.assistant');
    const lastMessageElement = messageElements[messageElements.length - 1];
    if (lastMessageElement) {
        const contentDiv = lastMessageElement.querySelector('.content');
        if (contentDiv) {
            contentDiv.appendChild(document.createTextNode(rawChunk.chunk));
            messageList.scrollTop = messageList.scrollHeight;
        
            const isScrolledToBottom = messageList.scrollHeight - messageList.clientHeight <= messageList.scrollTop + 1; // +1 for tolerance
            if (isScrolledToBottom) {
                    messageList.scrollTop = messageList.scrollHeight;
            }
        } else {
            console.error("Could not find .content div in the last assistant message element.");
        }
        
    } else {
        console.error("Could not find the last assistant message element.");
    }
 }
 

 /* Finalizes the last assistant message once streaming is complete */
 export function finalizeAssistantMessage() {
     const state = AppState.getInstance();
     const currentHistory = state.getState().chatHistory;
     const lastMessageIndex = currentHistory.length - 1;

     if (lastMessageIndex >= 0 && currentHistory[lastMessageIndex].role === 'assistant') {
         const finalRawContent = currentHistory[lastMessageIndex].rawContent || '';
         state.setCurrentTask("Processing final response...");

         const { html: finalHtml } = processResponse(finalRawContent);
         state.setCurrentTask("Response processed.");

         // Update the UI definitively
         const messageElements = messageList.querySelectorAll('.message.assistant');
         const lastMessageElement = messageElements[messageElements.length - 1];
          if (lastMessageElement) {
              const contentDiv = lastMessageElement.querySelector('.content');
              if (contentDiv) {
                  contentDiv.innerHTML = finalHtml;
                   // Ensure all citation listeners are attached
                   contentDiv.querySelectorAll<HTMLElement>('.citation').forEach(span => {
                           span.addEventListener('click', handleCitationClick);
                           span.addEventListener('mouseenter', handleCitationMouseEnter);
                           span.addEventListener('mouseleave', hideTooltip);
                           span.setAttribute('data-listener-attached', 'true');
                   });

                   messageList.scrollTop = messageList.scrollHeight;
              }
          }

         // Update the state with the final processed content
         const updatedHistory = [...currentHistory];
         updatedHistory[lastMessageIndex].content = finalHtml;
         // updatedHistory[lastMessageIndex].rawContent = undefined; // Clear raw buffer if no longer needed
         state.updateState({ chatHistory: updatedHistory });
     }
 }

/* Adds a temporary "Loading..." message for the assistant */
export function addAssistantLoadingMessage() {
     const state = AppState.getInstance();
     state.addChatMessage({
         role: 'assistant',
         content: '<p class="loading-indicator">Generating response...</p>',
         rawContent: '' // Initialize raw buffer
     });
 }