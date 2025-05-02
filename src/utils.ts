// src/utils.ts
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { AppState } from './state';

export function renderMarkdown(markdown: string): string {
    try {
        const rawHtml = marked.parse(markdown, { async: false }) as string; // Use sync rendering for simplicity here
        const sanitizeConfig = {
            ADD_TAGS: ['h3', 'div', 'span'],
            ADD_ATTR: ['class', 'title', 'data-chunk-key']
        };
        // Sanitize the HTML to prevent XSS attacks
        const cleanHtml = DOMPurify.sanitize(rawHtml, sanitizeConfig);
        return cleanHtml;
    } catch (error) {
        console.error("Markdown rendering error:", error);
        return `<p>Error rendering content.</p>`; // Fallback
    }
}

// Basic Citation Parsing and Rendering
// Regex to find <ref name="<|source_id|>N">...</ref> tags
const citationRegex = /<ref name="<\|source_id\|>(\d+)">.*?<\/ref>/g;
const simpleCitationRegex = /<\|source_id\|>(\d+)/g;

function processRawTextToHtmlStructure(rawText: string): string {
    let processedText = rawText;
    const state = AppState.getInstance(); // Get state needed for citations
    const appState = state.getState();
    const chunks = appState.chunks;
    const llmIndex = appState.llmIndex;

    // Remove content before <|language_end|> (if present)
    const languageEndIndex = processedText.indexOf('<|language_end|>');
    if (languageEndIndex !== -1) {
        processedText = processedText.substring(languageEndIndex + '<|language_end|>'.length);
    }

    // Replace structural tags using simple string replacement (replaceAll is safer)
    processedText = processedText.replaceAll('<|query_analysis_start|>', '<h3>Query Analysis</h3><div>');
    processedText = processedText.replaceAll('<|query_analysis_end|>', '</div>');
    processedText = processedText.replaceAll('<|query_report_start|>', '<h3>Query Report</h3><div>');
    processedText = processedText.replaceAll('<|query_report_end|>', '</div>');
    processedText = processedText.replaceAll('<|source_analysis_start|>', '<h3>Source Analysis</h3><div>');
    processedText = processedText.replaceAll('<|source_analysis_end|>', '</div>');
    processedText = processedText.replaceAll('<|source_report_start|>', '<h3>Source Report</h3><div>');
    processedText = processedText.replaceAll('<|source_report_end|>', '</div>');
    processedText = processedText.replaceAll('<|draft_start|>', '<h3>Draft</h3><div>');
    processedText = processedText.replaceAll('<|draft_end|>', '</div>');
    processedText = processedText.replaceAll('<|answer_start|>', '<h3>Answer</h3><div>');
    processedText = processedText.replaceAll('<|answer_end|>', '</div>');


    // Process Citations (Insert <span> tags)
    if (chunks && llmIndex) {
        // Process Complex Citations (<ref>...)
        processedText = processedText.replace(citationRegex, (match, sourceIndexStr) => {
            const sourceIndex = parseInt(sourceIndexStr, 10);
            if (isNaN(sourceIndex) || sourceIndex <= 0) return `[Invalid Ref Index: ${sourceIndexStr}]`;

            const chunkKey = llmIndex.get(sourceIndex - 1);
            const chunk = chunkKey ? chunks.get(chunkKey) : null;

            if (chunk) {
                const safeTitle = chunk.titre.replace(/"/g, '"').replace(/</g, '<').replace(/>/g, '>');
                // Use data-chunk-key for lookup in handlers
                return `<span class="citation" data-chunk-key="${chunkKey}" title="Source ${sourceIndex}: ${safeTitle} (Chunk ${chunk.chunkIndex})">[${sourceIndex}]</span>`;
            } else {
                console.warn(`Citation <ref> found for unknown source index: ${sourceIndex}`);
                return `[Source ${sourceIndex} not found]`;
            }
        });

        // Process Simple Citations (<|source_id|>N)
        processedText = processedText.replace(simpleCitationRegex, (match, sourceIndexStr) => {
            const sourceIndex = parseInt(sourceIndexStr, 10);
            if (isNaN(sourceIndex) || sourceIndex <= 0) return `[Invalid Source ID: ${sourceIndexStr}]`;

            const chunkKey = llmIndex.get(sourceIndex - 1);
            const chunk = chunkKey ? chunks.get(chunkKey) : null;

            if (chunk) {
                const safeTitle = chunk.titre.replace(/"/g, '"').replace(/</g, '<').replace(/>/g, '>');
                return `<span class="citation" data-chunk-key="${chunkKey}" title="Source ${sourceIndex}: ${safeTitle} (Chunk ${chunk.chunkIndex})">[${sourceIndex}]</span>`;
            } else {
                console.warn(`Simple citation <|source_id|> found for unknown source index: ${sourceIndex}`);
                return `[Source ${sourceIndex} not found]`;
            }
        });
    } else {
        console.warn("Chunks or llmIndex not available during citation processing.");
        // Replace placeholders with text if data is missing, otherwise they remain
        processedText = processedText.replace(citationRegex, "[Citation Data Missing]");
        processedText = processedText.replace(simpleCitationRegex, "[Citation Data Missing]");
    }

    return processedText;
}

export function processResponse(rawText: string): { html: string } {

    const textWithHtmlStructure = processRawTextToHtmlStructure(rawText);

    const finalHtml = renderMarkdown(textWithHtmlStructure);

    return { html: finalHtml };
}

// Debounce function to limit rapid API calls (e.g., for endpoint testing)
// export function debounce<T extends (...args: any[]) => any>(func: T, delay: number): (...args: Parameters<T>) => void {
//     let timeoutId: ReturnType<typeof setTimeout> | null = null;
//     return (...args: Parameters<T>) => {
//         if (timeoutId) {
//             clearTimeout(timeoutId);
//         }
//         timeoutId = setTimeout(() => {
//             func(...args);
//         }, delay);
//     };
// }

let tooltipElement: HTMLDivElement | null = null;
export function showTooltip(event: MouseEvent, text: string) {
    hideTooltip(); // Remove existing tooltip first

    if (!tooltipElement) {
        tooltipElement = document.createElement('div');
        tooltipElement.className = 'tooltip';
        document.body.appendChild(tooltipElement);
    }

    tooltipElement.textContent = text;
    tooltipElement.style.display = 'block';

    // Position tooltip near the mouse pointer
    // Add small offset to avoid covering the cursor
    const xOffset = 10;
    const yOffset = 15;
    let x = event.clientX + xOffset;
    let y = event.clientY + yOffset;

    // Adjust if tooltip goes off-screen
    const tooltipRect = tooltipElement.getBoundingClientRect();
    if (x + tooltipRect.width > window.innerWidth) {
        x = event.clientX - tooltipRect.width - xOffset; // Show on the left
    }
    if (y + tooltipRect.height > window.innerHeight) {
        y = event.clientY - tooltipRect.height - yOffset; // Show above
    }

    tooltipElement.style.left = `${x}px`;
    tooltipElement.style.top = `${y}px`;
}

export function hideTooltip() {
    if (tooltipElement) {
        tooltipElement.style.display = 'none';
    }
}