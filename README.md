# bRAG - Local RAG Chat Application

bRAG is a simple web-based chat application demonstrating the Retrieval-Augmented Generation (RAG) pattern locally. It interacts with two separate backend services:

1.  **Chunk Retrieval Service:** Fetches relevant text chunks based on the user's query.
2.  **LLM Generation Service:** Generates a response using a Large Language Model (specifically configured for [`PleIAs/Pleias-RAG-1B`](https://huggingface.co/PleIAs/Pleias-RAG-1B)), incorporating the retrieved chunks.


## Prerequisites

*   **Node.js and npm:** Required for building and running the development server.
*   **Chunk Retrieval Backend:** A running server accessible at the configured search endpoint (default: [`http://localhost:8000/search`](/src/config.ts)) and chunk endpoint (default: [`http://localhost:8000/chunk`](/src/config.ts)). This server should handle GET requests to `/search?query=...&top_n=...` and `/chunk?id=...&titre=...`.
*   **LLM Backend:** A running server compatible with the [`PleIAs/Pleias-RAG-1B`](/src/config.ts) model and the expected API, accessible at the configured LLM endpoint (default: [`http://localhost:8001/generate`](/src/config.ts)). This server should handle POST requests with a JSON body matching the [`GenerationRequest`](/src/types.ts) interface and return a Server-Sent Events (SSE) stream.

## Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd brag
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```

## Running the Application

### Development Mode

This command builds the application, starts a local development server, and watches for file changes.

```bash
npm run dev
```

The application will be available at http://localhost:5173 by default.

### Production Build

This command builds the application for production.

```bash
npm run build
```

The bundled output will be placed in the dist directory (.gitignore). You need to serve the contents of this directory (including index.html and bundle.js) using a static file server (like nginx, apache, serve, etc.).

## Configuration
- Backend Endpoints: The URLs for the search and LLM backends can be configured:
    - Via UI: Click the '☰' button in the status section to reveal the endpoint inputs and update button. Changes are saved to local storage.
    - Via Code: Modify the DEFAULT_SEARCH_ENDPOINT, DEFAULT_CHUNK_ENDPOINT, and DEFAULT_LLM_ENDPOINT constants in src/config.ts. You will need to rebuild the application after changing the code.
- Other Settings: Parameters like the number of chunks to retrieve (SEARCH_TOP_N), the default LLM model name (DEFAULT_LLM), max tokens (DEFAULT_MAX_TOKENS), and the end-of-sequence token (EOS_TOKEN) can be adjusted in src/config.ts.

## Usage
1. Ensure your backend services (chunk retrieval and LLM) are running.
2. Start the bRAG application (npm run dev).
3. Open the application in your browser.
4. If necessary, configure the backend endpoints in the status section.
5. Type your query into the input box and press Enter or click "Send".
6. The application will retrieve chunks, generate a response, and display it in the chat.
7. Retrieved source chunks appear in the right-hand panel (toggle with "Show sources" / "×").
8. Click on citations [N] in the assistant's response to highlight the corresponding chunk in the panel. Hover over citations for a tooltip preview.
9. Use the "Reuse previous chunks" checkbox to control whether chunks from previous searches are included in subsequent LLM calls.

## Licence 
This project is licensed under the Apache License 2.0. See the LICENSE file for details.