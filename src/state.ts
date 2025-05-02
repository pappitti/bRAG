// src/state.ts
import { AppState as AppStateType, BackendStatusType, ChatMessage, Chunk, SearchResponse, SearchResult } from './types';
import { DEFAULT_SEARCH_ENDPOINT, DEFAULT_LLM_ENDPOINT } from './config';
import { getChunkById } from './api';

// Type for state update listeners
type StateListener = (newState: AppStateType) => void;

// Singleton State Manager
export class AppState {
    private static instance: AppState;
    private state: AppStateType;
    private listeners: StateListener[] = [];

    private constructor() {
        this.state = this.loadState(); // Load initial state from localStorage if available
    }

    public static getInstance(): AppState {
        if (!AppState.instance) {
            AppState.instance = new AppState();
        }
        return AppState.instance;
    }

    private getDefaultState(): AppStateType {
         return {
            searchBackend: {
                status: 'idle',
                endpoint: DEFAULT_SEARCH_ENDPOINT,
            },
            llmBackend: {
                status: 'idle',
                endpoint: DEFAULT_LLM_ENDPOINT,
            },
            currentQuery: '',
            chatHistory: [],
            searchHistory: [],
            chunks: new Map<string, Chunk>(), 
            llmIndex: new Map<number, string>(), // Map of chunk index to LLM Input to the LLM key in chunks
            reuseChunks: false,
            isLoading: false,
            selectedChunkIndex: null
         };
    }

    private loadState(): AppStateType {
        // Temporarily disabled localStorage loading for testing
        // const savedState = localStorage.getItem('ragChatAppState');
        const defaultState = this.getDefaultState();
        // if (savedState) {
        //     console.log("Loading saved state:", savedState);
        //     try {
        //         const parsed = JSON.parse(savedState);
        //         // Merge saved endpoints with defaults, keep other defaults fresh
        //         return {
        //            ...defaultState,
        //            chatHistory : parsed.chatHistory ?? defaultState.chatHistory,
        //            searchBackend: {
        //                ...defaultState.searchBackend,
        //                endpoint: parsed.searchEndpoint || defaultState.searchBackend.endpoint,
        //            },
        //            llmBackend: {
        //                 ...defaultState.llmBackend,
        //                 endpoint: parsed.llmEndpoint || defaultState.llmBackend.endpoint,
        //            },
        //            reuseChunks: parsed.reuseChunks ?? defaultState.reuseChunks,
        //         };
        //     } catch (e) {
        //         console.error("Failed to parse saved state, using defaults.", e);
        //         return defaultState;
        //     }
        // }
        return defaultState;
    }

    private saveState() {
        // Only save persistent settings
        const stateToSave = {
            chatHistory : this.state.chatHistory,
            searchEndpoint: this.state.searchBackend.endpoint,
            llmEndpoint: this.state.llmBackend.endpoint,
            reuseChunks: this.state.reuseChunks,
        };
        localStorage.setItem('ragChatAppState', JSON.stringify(stateToSave));
    }

    public getState(): Readonly<AppStateType> {
        // Return a read-only copy or the direct state if mutation is controlled via methods
        return this.state;
    }

    public updateState(updates: Partial<AppStateType>) {
        // Merge updates into the current state
        this.state = { ...this.state, ...updates };
        console.log("State updated:", this.state); // Log state changes
        this.notifyListeners();

        // Persist relevant parts of the state
         if (updates.searchBackend || updates.llmBackend || updates.reuseChunks !== undefined ) {
             this.saveState();
         }
    }

    // --- Specific State Update Methods ---

    public addChatMessage(message: ChatMessage) {
        this.updateState({ chatHistory: [...this.state.chatHistory, message] });
    }

    public setBackendStatus(backend: 'search' | 'llm', status: BackendStatusType, error?: string) {
         const backendKey = `${backend}Backend` as const; // 'searchBackend' | 'llmBackend'
         this.updateState({
             [backendKey]: {
                 ...this.state[backendKey],
                 status: status,
                 error: error ?? (status === 'error' ? 'Unknown error' : undefined), // Set or clear error
             }
         });
    }

    public setEndpoints(searchEndpoint: string, llmEndpoint: string) {
        this.updateState({
            searchBackend: { ...this.state.searchBackend, endpoint: searchEndpoint },
            llmBackend: { ...this.state.llmBackend, endpoint: llmEndpoint },
        });
        this.saveState(); // Ensure endpoints are saved
     }

    public setSearchHistory(searchResults: SearchResult ) {
        this.updateState({ searchHistory: [...this.state.searchHistory, searchResults] });
     }

    public updateChunk(key : string, chunk: Chunk) {
        const chunks = new Map(this.state.chunks);
        chunks.set(key, chunk);
        this.updateState({ chunks: chunks });
    }

    public async addBeforeChunk(key: string) {
        const chunk = this.state.chunks.get(key);
        if (chunk && chunk.previousChunkIndex) {
            try {
                // API call to get the chunk before the current one
                const response = await getChunkById(chunk.previousChunkIndex, chunk.titre);
                if (!response) {
                    throw new Error('Network response was not ok');
                }
                const newChunk: Chunk = {
                    ...chunk,
                    previousChunkIndex: response.chunkIndex -1 >= 0 ? response.chunkIndex -1 : undefined,
                    contenu: `${response.contenu}  ${chunk.contenu}`, 
                };
                this.updateChunk(key, newChunk);
                this.setSelectedChunkIndex(key); // Show the new chunk in the viewer
            }
            catch (error) {
                this.setCurrentTask(`Error fetching previous chunk: ${error}`);
            }
        }
    }

    public async addAfterChunk(key: string) {
        const chunk = this.state.chunks.get(key);
        if (chunk && chunk.nextChunkIndex) {
            try {
                // API call to get the chunk after the current one
                const response = await getChunkById(chunk.nextChunkIndex, chunk.titre);
                if (!response) {
                    throw new Error('Network response was not ok');
                }
                const newChunk: Chunk = {
                    ...chunk,
                    nextChunkIndex: response.chunkIndex +1 <= chunk.totalChunks ? response.chunkIndex +1 : undefined,
                    contenu: `${chunk.contenu}  ${response.contenu}`, 
                };
                this.updateChunk(key, newChunk);
                this.setSelectedChunkIndex(key); // Show the new chunk in the viewer
            }
            catch (error) {
                this.setCurrentTask(`Error fetching next chunk: ${error}`);
            }
        }
    }

    public setChunks(chunks: Map<string, Chunk>) {
        this.updateState({ chunks: chunks });
    }

    public setLLMIndex(index: Map<number, string>) {
        this.updateState({ llmIndex: index });
    }

    public setLoading(isLoading: boolean) {
         this.updateState({ isLoading });
     }

    public setReuseChunks(reuse: boolean) {
         this.updateState({ reuseChunks: reuse });
         this.saveState(); 
     }

    public setCurrentQuery(query: string) {
         this.updateState({ currentQuery: query });
     }

    public setSelectedChunkIndex(index: string | null) {
          this.updateState({ selectedChunkIndex: index });
      }

    public setCurrentTask(task : string){
        this.updateState({ currentTask: task })
    }

    // --- Listener Management ---

    public subscribe(listener: StateListener) {
        this.listeners.push(listener);
        // Immediately call listener with current state
        listener(this.state);
    }

    public unsubscribe(listener: StateListener) {
        this.listeners = this.listeners.filter(l => l !== listener);
    }

    private notifyListeners() {
        this.listeners.forEach(listener => listener(this.state));
    }
}