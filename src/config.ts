// src/config.ts
export const DEFAULT_SEARCH_ENDPOINT = "http://localhost:8000/search"; // Replace with your default
export const DEFAULT_CHUNK_ENDPOINT = "http://localhost:8000/chunk"; // Replace with your default
export const DEFAULT_LLM_ENDPOINT = "http://localhost:8001/generate"; // Replace with your default or proxy path
export const SEARCH_TOP_N = 5; // Default number of chunks to retrieve
export const DEFAULT_LLM = "PleIAs/Pleias-RAG-1B";
export const DEFAULT_MAX_TOKENS= 2000; 
export const EOS_TOKEN = "<|end_of_text|>"; // End of text token for LLMs


// Citation configuration
export const CITATION_SETTINGS = {
    patternType: 'brackets', // 'brackets' for [1], 'superscript' for ^1, etc.
    showTooltips: true,
    maxTooltipLength: 150
};

// UI Configuration
export const UI_CONFIG = {
    messagesPerPage: 50,
    messageLoadThreshold: 0.9, // Load more when scrolled 90% to the top
    chunkPreviewLength: 150,
    maxSearchResults: 10, // Maximum number of search results to display
    defaultCollapsePanel: true
};