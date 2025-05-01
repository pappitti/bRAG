// src/utils.ts
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Chunk } from './types';
import { AppState } from './state';

// Configure marked (optional: add extensions, etc.)
// Example: Use GitHub Flavored Markdown
// marked.use(gfmHeadingId()); // You might need to install @markedjs/extension-gfm-heading-id

export function renderMarkdown(markdown: string): string {
    try {
        const rawHtml = marked.parse(markdown, { async: false }) as string; // Use sync rendering for simplicity here
        // Sanitize the HTML to prevent XSS attacks
        const cleanHtml = DOMPurify.sanitize(rawHtml);
        return cleanHtml;
    } catch (error) {
        console.error("Markdown rendering error:", error);
        return `<p>Error rendering content.</p>`; // Fallback
    }
}

// Basic Citation Parsing and Rendering
// Regex to find <ref name="<|source_id|>N">...</ref> tags
// It captures the index N and the inner text (if any, though the example doesn't show inner text)
const queryAnalysisRegex = /<\|query_analysis_start\|>.*?<\|query_analysis_end\|>/g;
const queryReportRegex = /<\|query_report_start\|>.*?<\|query_report_end\|>/g;
const sourceAnalysisRegex = /<\|source_analysis_start\|>.*?<\|source_analysis_end\|>/g;
const sourceReportRegex = /<\|source_report_start\|>.*?<\|source_report_end\|>/g;
const draftRegex = /<\|draft_start\|>.*?<\|draft_end\|>/g;
const answerRegex = /<\|answer_start\|>.*?<\|answer_end\|>/g;
const citationRegex = /<ref name="<\|source_id\|>(\d+)">.*?<\/ref>/g;
// Simpler regex if the LLM *only* outputs <|source_id|>N tags directly
const simpleCitationRegex = /<\|source_id\|>(\d+)/g;

export function processCitations(
    rawText: string
): { html: string; foundCitationIndices: number[] } {
    const appState = AppState.getInstance().getState();
    const chunks = appState.chunks;
    const llmIndex = appState.llmIndex;
    const foundCitationIndices = new Set<number>();

    // First, try the <ref> tag format
    let processedText = rawText.replace(citationRegex, (match, sourceIndexStr) => {
        const sourceIndex = parseInt(sourceIndexStr, 10); // This is the N in <|source_id|>N
        if (!isNaN(sourceIndex)) {
            // Map N back to the actual chunk using promptIndex
            const chunkId = llmIndex.get(sourceIndex-1);
            const chunk = chunkId ? chunks.get(chunkId) : null; // Get the chunk from the map
            if (chunk) {
                foundCitationIndices.add(sourceIndex-1);
                // Create a span with data attributes for interactivity
                return `<span class="citation" data-source-prompt-index="${chunkId}" title="Source ${sourceIndex}: ${chunk.titre} (ID: ${chunk.id})">[${sourceIndex}]</span>`;
            } else {
                 console.warn(`Citation found for unknown source index: ${sourceIndex}`);
                 return `[Source ${sourceIndex} not found]`;
            }
        }
        return match; // Return original match if parsing failed
    });

     // Then, try the simpler <|source_id|>N format if the above didn't replace everything
    processedText = processedText.replace(simpleCitationRegex, (match, sourceIndexStr) => {
        const sourceIndex = parseInt(sourceIndexStr, 10);
         if (!isNaN(sourceIndex)) {
            const chunkId = llmIndex.get(sourceIndex-1);
            const chunk = chunkId ? chunks.get(chunkId) : null; // Get the chunk from the map
            if (chunk) {
                foundCitationIndices.add(sourceIndex-1);
                // Use a slightly different visual if needed, or the same span
                return `<span class="citation" data-source-prompt-index="${chunkId}" title="Source ${sourceIndex}: ${chunk.titre} (ID: ${chunk.id})">[${sourceIndex}]</span>`;
            } else {
                  console.warn(`Simple citation found for unknown source index: ${sourceIndex}`);
                  return `[Source ${sourceIndex} not found]`;
            }
        }
         return match; // Return original match if parsing failed
    });


    // IMPORTANT: Convert markdown *after* processing citations to avoid messing up HTML attributes
    const finalHtml = renderMarkdown(processedText);

    return { html: finalHtml, foundCitationIndices: Array.from(foundCitationIndices) };
}


// Debounce function to limit rapid API calls (e.g., for endpoint testing)
export function debounce<T extends (...args: any[]) => any>(func: T, delay: number): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<T>) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            func(...args);
        }, delay);
    };
}

// Create a simple tooltip element
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
        // Optional: remove element if not reused often
        // tooltipElement.remove();
        // tooltipElement = null;
    }
}