import {
    Component,
    createMemo,
    createSignal,
    For,
    onMount,
    Show,
    onCleanup,
} from "solid-js";
import katex from "katex";
import "katex/dist/katex.min.css";
import { favorites, useFavorites } from "@/lib/favorites";
import { Paper } from "@/lib/papers";
import { updateReadingProgress } from "@/lib/progress";
import { TutorialOverlay } from "./TutorialOverlay";
import { AchievementToast } from "./AchievementToast";
import { toast } from "solid-sonner";
import MarkdownIt from "markdown-it";

interface LatexParserProps {
    text: string;
    isTitle?: boolean;
}

const PATTERNS = {
    INLINE_MATH: /\$([^\$]+)\$|\\\(([^\)]+)\\\)/g,
    DISPLAY_MATH: /\$\$([^\$]+)\$\$|\\\[([^\]]+)\\\]/g,
    SYMBOLS: {
        "\\alpha": "α",
        "\\beta": "β",
        "\\gamma": "γ",
        "\\delta": "δ",
        "\\epsilon": "ε",
        "\\zeta": "ζ",
        "\\eta": "η",
        "\\theta": "θ",
        "\\iota": "ι",
        "\\kappa": "κ",
        "\\lambda": "λ",
        "\\mu": "μ",
        "\\nu": "ν",
        "\\xi": "ξ",
        "\\pi": "π",
        "\\rho": "ρ",
        "\\sigma": "σ",
        "\\tau": "τ",
        "\\upsilon": "υ",
        "\\phi": "φ",
        "\\chi": "χ",
        "\\psi": "ψ",
        "\\omega": "ω",
        "\\infty": "∞",
        "\\pm": "±",
        "\\times": "×",
        "\\div": "÷",
        "\\leq": "≤",
        "\\geq": "≥",
        "\\neq": "≠",
        "\\approx": "≈",
        "\\cdot": "·",
    },
    FORMATTING: {
        textbf: /\\textbf\{([^}]+)\}/g,
        textit: /\\textit\{([^}]+)\}/g,
        underline: /\\underline\{([^}]+)\}/g,
        emph: /\\emph\{([^}]+)\}/g,
    },
    CITATIONS: /\\cite\{([^}]+)\}/g,
    REFERENCES: /\\ref\{([^}]+)\}/g,
};

const formatText = (text: string) => {
    text = text.replace(
        PATTERNS.FORMATTING.textbf,
        '<span class="font-bold">$1</span>'
    );
    text = text.replace(
        PATTERNS.FORMATTING.textit,
        '<span class="italic">$1</span>'
    );
    text = text.replace(
        PATTERNS.FORMATTING.underline,
        '<span class="underline">$1</span>'
    );
    text = text.replace(
        PATTERNS.FORMATTING.emph,
        '<span class="italic">$1</span>'
    );

    text = text.replace(
        PATTERNS.CITATIONS,
        '<span class="text-blue-500 cursor-pointer">[citation]</span>'
    );
    text = text.replace(
        PATTERNS.REFERENCES,
        '<span class="text-blue-500 cursor-pointer">[ref]</span>'
    );

    for (const [symbol, replacement] of Object.entries(PATTERNS.SYMBOLS)) {
        text = text.replaceAll(symbol, replacement);
    }

    return text;
};

const md = new MarkdownIt({
    html: false,
    breaks: true,
    linkify: true,
});

export const LatexParser: Component<LatexParserProps> = (props) => {
    const parsedContent = createMemo(() => {
        let content = props.text;
        
        // First pass: Extract and save LaTeX blocks
        const latexBlocks: string[] = [];
        content = content.replace(PATTERNS.DISPLAY_MATH, (match, g1, g2) => {
            const formula = g1 || g2;
            try {
                const rendered = katex.renderToString(formula, { displayMode: true });
                latexBlocks.push(rendered);
                return `%%LATEX_BLOCK_${latexBlocks.length - 1}%%`;
            } catch (error) {
                console.error("KaTeX error:", error);
                return `<div class="my-4 px-4 py-2 text-red-500 border border-red-300 rounded bg-red-50">${formula}</div>`;
            }
        });

        content = content.replace(PATTERNS.INLINE_MATH, (match, g1, g2) => {
            const formula = g1 || g2;
            try {
                const rendered = katex.renderToString(formula, { displayMode: false });
                latexBlocks.push(rendered);
                return `%%LATEX_INLINE_${latexBlocks.length - 1}%%`;
            } catch (error) {
                console.error("KaTeX error:", error);
                return formula;
            }
        });

        // Second pass: Parse markdown
        content = md.render(content);

        // Third pass: Restore LaTeX blocks
        content = content.replace(/%%LATEX_BLOCK_(\d+)%%/g, (_, index) => {
            return `<div class="my-4 px-4 py-2 overflow-x-auto">${latexBlocks[parseInt(index)]}</div>`;
        });

        content = content.replace(/%%LATEX_INLINE_(\d+)%%/g, (_, index) => {
            return latexBlocks[parseInt(index)];
        });

        // Return as a single segment
        return [{
            type: "text",
            content: content
        }];
    });

    return (
        <div
            class={`text-base leading-relaxed text-gray-700 [&_p]:mb-4 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:mb-4 [&_li]:mb-1 [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4 [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-gray-100 [&_pre]:p-4 [&_pre]:rounded [&_pre]:mb-4 ${
                props.isTitle
                    ? "text-xl sm:text-2xl md:text-3xl font-bold leading-tight tracking-tight"
                    : ""
            }`}
        >
            <For each={parsedContent()}>
                {(segment) => (
                    <Show
                        when={segment.type === "text"}
                        fallback={
                            <span
                                class={`${
                                    segment.type === "display-math"
                                        ? "block my-4"
                                        : "inline"
                                } [&_.katex]:text-lg [&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-2`}
                                innerHTML={segment.content}
                            />
                        }
                    >
                        <span innerHTML={segment.content} />
                    </Show>
                )}
            </For>
        </div>
    );
};

interface PaperCardProps {
    paper: Paper;
    showTutorial?: boolean;
    onTutorialDismiss?: () => void;
    onSwipe?: (direction: "up" | "down" | null) => void;
}

const sourceIcons = {
    arxiv: { icon: "🔬", color: "bg-blue-50 text-blue-700" },
    medrxiv: { icon: "🏥", color: "bg-green-50 text-green-700" },
    biorxiv: { icon: "🧬", color: "bg-purple-50 text-purple-700" },
    pubmed: { icon: "📚", color: "bg-amber-50 text-amber-700" },
    hackernews: { icon: "💻", color: "bg-orange-50 text-orange-700" },
} as const;

export const PaperCard: Component<PaperCardProps> = (props) => {
    const { isFavorite, addFavorite, removeFavorite } = useFavorites();
    const [isScrollable, setIsScrollable] = createSignal(false);
    const [touchStartY, setTouchStartY] = createSignal(0);
    const [isInteracting, setIsInteracting] = createSignal(false);
    const [lastTap, setLastTap] = createSignal(0);
    const [showHeartAnimation, setShowHeartAnimation] = createSignal(false);
    const [initialTouch, setInitialTouch] = createSignal<{
        y: number;
        time: number;
    } | null>(null);
    const [isScrolling, setIsScrolling] = createSignal(false);
    const [currentAchievement, setCurrentAchievement] = createSignal<{
        title: string;
        description: string;
        icon: string;
    } | null>(null);
    const [scrollStartPos, setScrollStartPos] = createSignal(0);
    const [momentumId, setMomentumId] = createSignal<number | null>(null);

    let contentRef: HTMLDivElement | undefined;
    let summaryRef: HTMLDivElement | undefined;

    onMount(() => {
        if (contentRef) {
            const resizeObserver = new ResizeObserver(() => {
                setIsScrollable(
                    contentRef.scrollHeight > contentRef.clientHeight
                );
            });
            resizeObserver.observe(contentRef);
            return () => resizeObserver.disconnect();
        }
    });

    onCleanup(() => {
        if (momentumId()) {
            cancelAnimationFrame(momentumId()!);
        }
    });

    const smoothScroll = (targetPos: number, duration: number) => {
        const startPos = summaryRef!.scrollTop;
        const distance = targetPos - startPos;
        const startTime = performance.now();

        const animation = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const easeOutCubic = 1 - Math.pow(1 - progress, 3);

            summaryRef!.scrollTop = startPos + distance * easeOutCubic;

            if (progress < 1) {
                setMomentumId(requestAnimationFrame(animation));
            } else {
                setMomentumId(null);
            }
        };

        setMomentumId(requestAnimationFrame(animation));
    };

    const isAtTop = () => summaryRef?.scrollTop === 0;
    const isAtBottom = () => {
        if (!summaryRef) return false;
        const scrollBottom = Math.abs(
            summaryRef.scrollHeight -
                summaryRef.clientHeight -
                summaryRef.scrollTop
        );
        return scrollBottom < 1;
    };

    const handleWheel = (e: WheelEvent) => {
        if (!summaryRef) return;

        const delta = e.deltaY;

        if (delta < 0 && isAtTop()) {
            props.onSwipe?.("down");
            return;
        }

        if (delta > 0 && isAtBottom()) {
            props.onSwipe?.("up");
            return;
        }

        if ((delta > 0 && !isAtBottom()) || (delta < 0 && !isAtTop())) {
            e.stopPropagation();
        }
    };

    const handleTouchStart = (e: TouchEvent) => {
        if (!summaryRef) return;
        const touch = e.touches[0];
        setTouchStartY(touch.clientY);
        setScrollStartPos(summaryRef.scrollTop);
        setIsScrolling(false);
        props.onSwipe?.(null);
    };

    const handleTouchMove = (e: TouchEvent) => {
        if (!summaryRef) return;

        const touch = e.touches[0];
        const deltaY = touchStartY() - touch.clientY;
        const newScrollTop = scrollStartPos() + deltaY;

        if (deltaY < 0 && isAtTop()) {
            props.onSwipe?.("down");
            return;
        }

        if (deltaY > 0 && isAtBottom()) {
            props.onSwipe?.("up");
            return;
        }

        if ((deltaY > 0 && !isAtBottom()) || (deltaY < 0 && !isAtTop())) {
            e.preventDefault();
            summaryRef.scrollTop = newScrollTop;
            setIsScrolling(true);
        }
    };

    const handleTouchEnd = () => {
        setIsScrolling(false);
        if (isAtTop() || isAtBottom()) {
            props.onSwipe?.(null);
        }
    };

    const handleDoubleTap = (e: MouseEvent | TouchEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName.toLowerCase() === "a" || target.closest("a")) return;

        if (e instanceof TouchEvent) {
            e.preventDefault();
            e.stopPropagation();
            
            const now = Date.now();
            if (now - lastTap() < 300) { // 300ms for double tap
                toggleFavoriteWithAnimation();
            }
            setLastTap(now);
        } else {
            // Para clicks de escritorio usamos dblclick
            handleDoubleClick(e);
        }
    };

    const handleDoubleClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavoriteWithAnimation();
    };

    const toggleFavoriteWithAnimation = () => {
        if (!isFavorite(props.paper.id)) {
            setShowHeartAnimation(true);
            setTimeout(() => setShowHeartAnimation(false), 800); // Ajustado a 800ms para coincidir con la animación
        }
        toggleFavorite();
    };

    const toggleFavorite = () => {
        if (isFavorite(props.paper.id)) {
            removeFavorite(props.paper.id);
            toast.error("Removed from favorites", {
                description: props.paper.title.slice(0, 60) + "...",
                duration: 2000,
            });
        } else {
            addFavorite(props.paper);
            const favCount = favorites().length;
            if (favCount === 1) {
                toast.success("First Favorite!", {
                    description: "You've saved your first paper",
                    icon: "⭐",
                    duration: 3000,
                });
            } else {
                toast.success("Added to favorites", {
                    description: props.paper.title.slice(0, 60) + "...",
                    duration: 2000,
                });
            }
        }
    };

    return (
        <article class="h-full w-full flex items-center justify-center p-4 sm:p-8">
            <div class="relative paper-card max-w-2xl w-full h-[85vh] rounded-2xl bg-white shadow-xl flex flex-col">
                <div class="flex justify-between items-start p-4 sm:p-6">
                    <div class="flex items-center space-x-2">
                        <div
                            class={`flex items-center px-2.5 py-1 rounded-full ${
                                sourceIcons[props.paper.source].color
                            }`}
                        >
                            <span class="text-base mr-1.5">
                                {sourceIcons[props.paper.source].icon}
                            </span>
                            <span class="text-xs font-medium">
                                {props.paper.source === "arxiv"
                                    ? "arXiv"
                                    : props.paper.source === "medrxiv"
                                    ? "medRxiv"
                                    : props.paper.source === "biorxiv"
                                    ? "bioRxiv"
                                    : props.paper.source === "pubmed"
                                    ? "PubMed"
                                    : "HackerNews"}
                            </span>
                        </div>
                        <span class="text-xs text-gray-500">
                            {new Date(props.paper.published).toLocaleDateString(
                                "en-US",
                                {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                }
                            )}
                        </span>
                    </div>
                    <button
                        onClick={toggleFavorite}
                        class="p-2 bg-white shadow-md rounded-full hover:bg-gray-50 transition-all duration-300 active:scale-95 transform hover:scale-105"
                    >
                        <svg
                            class={`w-6 h-6 ${
                                isFavorite(props.paper.id)
                                    ? "text-red-500 fill-current"
                                    : "text-gray-400"
                            }`}
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                            />
                        </svg>
                    </button>
                </div>

                <div class="px-4 sm:px-6 pb-4">
                    <LatexParser text={props.paper.title} isTitle />
                    <Show when={props.paper.pdfLink}>
                        <a
                            href={props.paper.pdfLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex items-center mt-2 text-sm text-blue-500 hover:text-blue-600"
                        >
                            <svg
                                class="w-4 h-4 mr-1"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                            >
                                <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                                <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                            </svg>
                            View source
                        </a>
                    </Show>
                </div>

                <div
                    ref={summaryRef}
                    class="flex-1 px-4 sm:px-6 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300/50 scrollbar-track-transparent hover:scrollbar-thumb-gray-300 overscroll-contain"
                    style="touch-action: pan-y; -webkit-overflow-scrolling: touch;"
                    onWheel={handleWheel}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onDblClick={handleDoubleTap}
                    onClick={handleDoubleTap}
                >
                    <div class="space-y-4 pb-4">
                        <LatexParser text={props.paper.summary} />
                    </div>
                </div>

                <div class="p-4 sm:p-6 border-t border-gray-100">
                    <div class="flex flex-wrap gap-1.5">
                        <For each={props.paper.authors}>
                            {(author) => (
                                <span class="inline-flex text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                                    {author}
                                </span>
                            )}
                        </For>
                    </div>
                </div>

                <Show when={currentAchievement()}>
                    <AchievementToast {...currentAchievement()!} show={true} />
                </Show>

                <Show when={showHeartAnimation()}>
                    <div class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
                        <div class="animate-like-pop">
                            <svg
                                class="w-32 h-32 text-red-500 filter drop-shadow-xl"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                            </svg>
                        </div>
                    </div>
                </Show>

                <Show when={props.showTutorial}>
                    <TutorialOverlay onDismiss={props.onTutorialDismiss} />
                </Show>
            </div>
        </article>
    );
};
