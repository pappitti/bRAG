// src/config.ts
export const DEFAULT_SEARCH_ENDPOINT = "http://localhost:8000/search"; 
export const DEFAULT_CHUNK_ENDPOINT = "http://localhost:8000/chunk"; 
export const DEFAULT_LLM_ENDPOINT = "http://localhost:8001/generate"; 
export const SEARCH_TOP_N = 5; 
export const DEFAULT_LLM = "PleIAs/Pleias-RAG-1B";
export const DEFAULT_MAX_TOKENS= 2000; 
export const EOS_TOKEN = "<|end_of_text|>"; // have to pass this for Pleias-RAG-1B