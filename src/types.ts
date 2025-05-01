// src/types.ts

export interface Chunk {
    id: number; // ID of the chunk within the database (unique)
    chunkIndex: number; // ID of the chunk within its document
    titre: string; // Title of the document the chunk belongs to
    score?: number; // Retrieval score (optional, not present in /chunk response)
    contenu: string; // Markdown content of the chunk
    date: string; // Date of the document
    auteurs: string[]; // Authors of the document
    totalChunks: number; // Total number of chunks in the document
    previousChunkIndex?: number; // Previous chunk index (optional)
    nextChunkIndex?: number; // Next chunk index (optional)
    active?: boolean; // Flag to indicate if the chunk is active (optional)
}

export interface SearchResponse {
    results: Chunk[];
    query: string;
    count: number;
}

export interface SearchResult {
    results: string[]; // only key (time-id) of the chunks
    query: string;
    count: number;
    time : string;
} 

export type BackendStatusType = 'idle' | 'loading' | 'error' | 'ok' | 'streaming';

export interface BackendState {
    status: BackendStatusType;
    endpoint: string;
    error?: string;
}

export interface AppState {
    searchBackend: BackendState;
    llmBackend: BackendState;
    currentQuery: string;
    chatHistory: ChatMessage[];
    searchHistory : SearchResult[]
    chunks: Map<string, Chunk>; 
    llmIndex:Map<number, string>; // Map of chunk index to LLM Input to the LLM key in chunks
    reuseChunks: boolean;
    isLoading: boolean; // Overall loading state
    currentLLMResponse: string; // Buffer for streaming response
    selectedChunkIndex: string | null; // chunk to show in viewer
    currentTask ? : string
}

export interface GenerationRequest{
    model: string;
    adapter_path? : string;
    trust_remote_code?: boolean;
    eos_token? : string;
    prompt: string;
    max_tokens?: number;
    stream?: boolean ;
    verbose? : boolean;
    temp?: number ;
    top_p?: number;
    min_p?: number;
    seed?: number;
    ignore_chat_template?: boolean;
    use_default_chat_template? : boolean;
    max_kv_size?: number;
    prompt_cache_file?: string;
    kv_bits?: number;
    kv_group_size?: number;
    quantized_kv_start?: number;
    repetition_penalty?: number;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system'; // System for errors/info
    content: string; // Rendered HTML content
    rawContent?: string; // Raw response before processing (optional)
}

export interface StreamResponse {
    chunk: string;// The chunk of data received
    model : string; // Model used for the response
    usage : Record<string, any>; // Usage statistics
    done? : boolean; // Indicates if the stream is complete
}
