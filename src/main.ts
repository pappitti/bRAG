// src/main.ts
import { AppState } from './state';
import { initializeUI, addAssistantLoadingMessage, appendStreamContent, finalizeAssistantMessage } from './ui';
import { searchChunks, generateResponseStream } from './api';
import { Chunk, SearchResult, StreamResponse } from './types';

// --- Main Application Logic ---

async function handleRagRequest() {
    const appState = AppState.getInstance();
    const state = appState.getState();
    const query = state.currentQuery;

    if (!query) {
        console.warn("Attempted RAG request with empty query.");
        return;
    }

    appState.setCurrentTask(`Starting RAG process for query: ${query}`)
    appState.setLoading(true);
    appState.setBackendStatus('search', 'loading');

    let currentChunks = new Map<string, Chunk>(appState.getState().chunks); 

    const searchTime = new Date().toISOString(); 

    try {
        // Search for chunks
        const searched = await searchChunks(query);
        
        const searchKeys : string[] = [];
       
        searched.results.forEach((chunk) => {
            // Check if the chunk already exists in the current chunks
            const key = `${searchTime}-${chunk.id}`;
            if (!currentChunks.has(key)) {
                const augmentedChunk = {
                    ...chunk,
                    previousChunkIndex: chunk.chunkIndex > 0 ? chunk.chunkIndex - 1 : undefined,
                    nextChunkIndex: chunk.chunkIndex < chunk.totalChunks - 1 ? chunk.chunkIndex + 1 : undefined,
                    active: true, // Mark as active
                }
                currentChunks.set(key, augmentedChunk); 
                searchKeys.push(key); 
            } else {
                console.log(`Chunk ${key} already exists in the current chunks.`);
            }
        }
        );
        const searchResults : SearchResult = {
            time: searchTime, 
            results: searchKeys, 
            query: searched.query,
            count: searched.count,
        };
        appState.setBackendStatus('search', 'ok');
        appState.setSearchHistory(searchResults); // Update the list of *retrieved* chunks
        appState.setChunks(currentChunks); // Update the state with the new chunks
        appState.setCurrentTask(`Search successful, chunks retrieved: ${searchResults.count}`);

    } catch (error: any) {
        appState.setCurrentTask(`Search failed: ${error}`);
        appState.setBackendStatus('search', 'error', error.message || 'Unknown search error');
        appState.addChatMessage({ role: 'system', content: `<p class="error-message">Error fetching search results: ${error.message}</p>` });
        appState.setLoading(false);
        return; 
    }

    // Prepare chunks for LLM (handle reuse)
    let chunksForLLM = Array.from(currentChunks.entries())
        .filter(chunk => chunk[1].active) // Only include active chunks

    if (!state.reuseChunks) {
        // Only use the chunks whith a key that starts with the search time
        chunksForLLM = chunksForLLM.filter(chunk => chunk[0].startsWith(`${searchTime}-`));
        appState.setCurrentTask(`Not reusing chunks. Total chunks for LLM: ${chunksForLLM.length}`);
    } else {
        appState.setCurrentTask(`Reusing active chunks. Total active chunks: ${chunksForLLM.length}`);
    }

    const chunkKeys : [number, string][]= chunksForLLM.map((chunk, index) => [index, chunk[0]]);
    const llmIndex = new Map(chunkKeys); 
    appState.setLLMIndex(llmIndex); // Update LLM index in state


    // Call LLM if chunks are available
    if (chunksForLLM.length === 0) {
        appState.setCurrentTask("No chunks found or prepared for LLM.");
        appState.addChatMessage({ role: 'assistant', content: `<p>I couldn't find any relevant information to answer your query.</p>` });
        appState.setLoading(false);
        appState.setBackendStatus('llm', 'idle'); 
        return;
    }

    appState.setBackendStatus('llm', 'loading');
    addAssistantLoadingMessage(); // Add placeholder message

    try {
         appState.setCurrentTask("Calling LLM generation stream...");
         await generateResponseStream(
            query,
            (streamChunk) => {
                // On receiving data: Append to UI and update state buffer
                appendStreamContent(streamChunk); // Pass active chunks for citation mapping
            },
            (error) => {
                // On stream error:
                appState.setCurrentTask(`LLM stream error: (${error})`);
                appState.setBackendStatus('llm', 'error', error.message || 'Streaming error');
                appState.addChatMessage({ role: 'system', content: `<p class="error-message">Error during response generation: ${error.message}</p>` });
                finalizeAssistantMessage(); // Attempt to finalize with what we have
                appState.setLoading(false);
            },
            () => {
                // On stream complete:
                appState.setCurrentTask("LLM stream completed successfully.");
                appState.setBackendStatus('llm', 'ok');
                finalizeAssistantMessage(); 
                appState.setLoading(false);
            }
        );
    } catch (error: any) {
         // Catch errors from the initial fetch call setup in generateResponseStream
         appState.setCurrentTask(`LLM invocation failed: (${error})`);
         appState.setBackendStatus('llm', 'error', error.message || 'Unknown LLM error');
         appState.addChatMessage({ role: 'system', content: `<p class="error-message">Failed to start response generation: ${error.message}</p>` });

         const history = appState.getState().chatHistory;
         if (history.length > 0 && history[history.length-1].role === 'assistant' && history[history.length-1].content.includes('loading-indicator')) {
             history.pop(); // Remove the loading message
             appState.updateState({ chatHistory: history }); 
         }
         appState.setLoading(false);
    }
}


// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed");

    const appState = AppState.getInstance();
    initializeUI(appState);

    // Listen for the custom event dispatched by the UI on send click/enter
    document.addEventListener('sendquery', () => {
         handleRagRequest();
    });

    // Setup keyboard shortcut for toggling panel (Ctrl+B)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'b') {
            e.preventDefault();
            const rightPanel = document.getElementById('right-panel');
            if (rightPanel) {
                rightPanel.classList.toggle('collapsed');
            }
        }
    });

    appState.setCurrentTask("RAG Chat App Initialized");
});