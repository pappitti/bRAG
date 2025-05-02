// src/api.ts
import { AppState } from './state'; 
import { SearchResponse, Chunk, GenerationRequest, StreamResponse } from './types';
import { SEARCH_TOP_N, DEFAULT_CHUNK_ENDPOINT, DEFAULT_LLM, DEFAULT_MAX_TOKENS, EOS_TOKEN } from './config';

/* Performs a search query against the BM25 backend */
export async function searchChunks(query: string): Promise<SearchResponse> {
    const endpoint = AppState.getInstance().getState().searchBackend.endpoint;
    const url = new URL(endpoint);
    url.searchParams.append('query', query);
    url.searchParams.append('top_n', SEARCH_TOP_N.toString());

    console.log(`Searching with URL: ${url.toString()}`);

    try {
        const response = await fetch(url.toString(), { method: 'GET' });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Failed to parse error response' }));
            console.error("Search API Error:", response.status, errorData);
            throw new Error(errorData.detail || `Search failed with status ${response.status}`);
        }

        const data: SearchResponse = await response.json();
        console.log("Search results received:", data);
        return data;
    } catch (error) {
        console.error("Fetch error during search:", error);
        throw error; // Re-throw to be caught by the caller
    }
}

/* Fetches a specific chunk by its ID and Titre */
export async function getChunkById(chunk_index: number, titre: string): Promise<Chunk | null> {

     const searchEndpointUrl = new URL(AppState.getInstance().getState().searchBackend.endpoint);
     const chunkEndpointPath = DEFAULT_CHUNK_ENDPOINT.startsWith('/')
         ? DEFAULT_CHUNK_ENDPOINT
         : new URL(DEFAULT_CHUNK_ENDPOINT).pathname; 

     const url = new URL(chunkEndpointPath, searchEndpointUrl.origin); 
     url.searchParams.append('id', chunk_index.toString());
     url.searchParams.append('titre', titre);


    console.log(`Fetching chunk with URL: ${url.toString()}`);

    try {
        const response = await fetch(url.toString(), { method: 'GET' });

        if (!response.ok) {
             const errorData = await response.json().catch(() => ({ detail: 'Failed to parse error response' }));
             console.error("Get Chunk API Error:", response.status, errorData);
            // Don't throw an error here, just return null to indicate failure
            return null;
        }

        const data: SearchResponse = await response.json();
        if (data.results && data.results.length > 0) {
            console.log("Chunk received:", data.results[0]);
            return data.results[0];
        } else {
            console.warn(`Chunk not found for id=${chunk_index}, titre=${titre}`);
            return null;
        }
    } catch (error) {
        console.error("Fetch error during get chunk:", error);
        return null; // Return null on fetch error
    }
}


/* Generates the prompt string based on the template */
function buildLLMPrompt(query: string, chunks: Chunk[]): string {
    let prompt = `<|query_start|>${query}<|query_end|>`;
    chunks.forEach((chunk, index) => {
        // Assign a 1-based index for the prompt, store it on the chunk for later mapping
        prompt += `\n<|source_start|><|source_id|>${index+1} ${chunk.contenu}<|source_end|>`;
    });
    prompt += `\n<|language_start|>`; // Pleias-1B expects this to start generation
    return prompt;
}

/* Sends the query and chunks to the LLM backend and handles streaming response. */
export async function generateResponseStream(
    query: string,
    onData: (chunk: StreamResponse) => void, 
    onError: (error: Error) => void,
    onComplete: () => void
): Promise<void> {
    const appState = AppState.getInstance().getState();
    const endpoint = appState.llmBackend.endpoint;
    const chunks = Array.from(appState.llmIndex.values())
        .map((chunkKey) => appState.chunks.get(chunkKey))
        .filter((chunk) => chunk !== undefined) as Chunk[]; // Filter out undefined chunks
    const prompt = buildLLMPrompt(query, chunks);

    const generationRequest: GenerationRequest = {
        prompt : prompt,
        model : DEFAULT_LLM,
        max_tokens: DEFAULT_MAX_TOKENS,
        stream: true,
        temp: 0.7,
        eos_token: EOS_TOKEN,
    }

    console.log("Sending prompt to LLM:", prompt); 

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json', 
            },
            body: JSON.stringify(generationRequest), 
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Failed to parse error response' }));
            throw new Error(errorData.detail || `LLM generation failed with status ${response.status}`);
        }

        if (!response.body) {
            throw new Error("Response body is null");
        }

        // Process the stream
        AppState.getInstance().setBackendStatus('llm', 'streaming'); 
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            const textChunk = decoder.decode(value, { stream: !done });
            buffer += textChunk;

            // TODO : fix the issue of double content (final message is duplicated)
            if (done) {
                console.log('LLM stream finished.');
                // Process any remaining data in the buffer before completing
                processBuffer(buffer, onData, onError);
                onComplete();
                break;
            }
            
            // Process the buffer to extract complete SSE messages
            buffer = processBuffer(buffer, onData, onError);
        }

    } catch (error: any) {
        console.error("LLM Generation Error:", error);
        onError(error);
    }
}

function processBuffer(
    buffer: string,
    onData: (data: StreamResponse) => void,
    onError: (error: Error) => void // TODO: handle error
): string {
    // SSE messages are separated by double newlines
    const messageSeparator = '\n\n';
    let messages = buffer.split(messageSeparator);

    // If the buffer doesn't end with \n\n, the last part is incomplete
    const lastMessageIncomplete = !buffer.endsWith(messageSeparator);
    const incompletePart = lastMessageIncomplete ? messages.pop() || '' : '';

    for (const message of messages) {
        if (!message.trim()) {
            continue; 
        }

        // Find the 'data: ' line
        const lines = message.split('\n');
        for (const line of lines) {
             if (line.startsWith('data:')) {
                const jsonString = line.substring(5).trim(); // Get content after 'data:'
                if (jsonString) {
                    try {
                        const parsedData = JSON.parse(jsonString);

                        // Basic validation to check if it matches StreamResponse structure
                        if (parsedData && typeof parsedData.chunk === 'string' && typeof parsedData.model === 'string' && typeof parsedData.usage === 'object') {
                             onData(parsedData as StreamResponse);
                        } else {
                             console.warn("Received data doesn't match StreamResponse format:", parsedData);
                             // TODO: handle error
                        }

                    } catch (e) {
                        console.error('Failed to parse JSON from SSE data:', jsonString, e);
                    }
                }
                // Break after finding the first 'data:' line in a multi-line message block if necessary,
                break;
             }
        }
    }

    // Return the incomplete part to be prepended to the next chunk
    return incompletePart;
}