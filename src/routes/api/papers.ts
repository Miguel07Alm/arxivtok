import type { APIEvent } from "@solidjs/start/server";
import { parseStringPromise } from "xml2js"
import { simplifyAbstract } from "../../lib/gemini";

const ARXIV_API_URL = "https://export.arxiv.org/api/query"
const MEDRXIV_API_URL = "https://api.medrxiv.org/details/medrxiv"
const BIORXIV_API_URL = "https://api.biorxiv.org/details/biorxiv"
const PUBMED_ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
const PUBMED_ESUMMARY_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
const HACKERNEWS_API_URL = "https://hacker-news.firebaseio.com/v0";

interface ArxivEntry {
	id: string[]
	title: string[]
	summary: string[]
	author?: Array<{ name: string[] }>
	published: string[]
	link?: Array<{ $: { title?: string; href?: string } }>
}

interface MedrxivEntry {
	doi: string
	title: string
	abstract: string
	authors: string
	date: string
	version: string
	category: string
	author_corresponding_institution: string
}

interface ArxivResponse {
	feed: { entry?: ArxivEntry | ArxivEntry[] }
}

interface MedrxivResponse {
	collection?: MedrxivEntry[]
}

export async function GET({ request }: APIEvent) {
	const url = new URL(request.url)
	const page = Number(url.searchParams.get("page")) || 0
	const perPage = Number(url.searchParams.get("perPage")) || 10
	const query = url.searchParams.get("q") || ""
	const source = url.searchParams.get("source") || "arxiv"
	
	let papers;
	switch (source) {
		case "medrxiv":
			papers = await fetchMedrxiv(query, page, perPage)
			break;
		case "biorxiv":
			papers = await fetchBiorxiv(query, page, perPage)
			break;
		case "pubmed":
			papers = await fetchPubmed(query, page, perPage)
			break;
		case "hackernews":
			papers = await fetchHackerNews(query, page, perPage)
			break;
		default:
			papers = await fetchArxiv(query, page, perPage)
	}
	let papersData = await papers.json()
	
	if (process.env.GEMINI_API_KEY) {
		papersData = await Promise.all(papersData.map(async (paper: { summary: string }) => ({
			...paper,
			summary: await simplifyAbstract(paper.summary)
		})));
	}

	return new Response(JSON.stringify(papersData), { 
		headers: { "Content-Type": "application/json" } 
	})
}

async function fetchArxiv(query: string, page: number, perPage: number): Promise<Response> {
	const start = page * perPage
	let searchQuery = ""
	if (query) {
		const queries = query.split("|").filter(Boolean)
		if (queries.length > 0) {
			const formattedQueries = queries.map(q => {
				const terms = q.trim().split(" ").filter(Boolean)
				if (terms.length > 1) {
					const combinedTerms = terms.map(term => `(abs:${term} OR ti:${term} OR all:${term})`).join(" AND ")
					return `(${combinedTerms})`
				} else {
					return `(abs:${terms[0]} OR ti:${terms[0]} OR all:${terms[0]})`
				}
			})
			searchQuery = formattedQueries.join(" AND ")
		}
	}
	const arxivUrl = `${ARXIV_API_URL}?search_query=${encodeURIComponent(searchQuery)}&start=${start}&max_results=${perPage}&sortBy=submittedDate&sortOrder=descending`
	try {
		const response = await fetch(arxivUrl)
		const xmlData = await response.text()
		const result = await parseStringPromise(xmlData) as ArxivResponse
		const entries = result.feed.entry || []
		const papers = Array.isArray(entries) ? entries.map(transformArxivEntry) : [transformArxivEntry(entries)]
		return new Response(JSON.stringify(papers), { headers: { "Content-Type": "application/json" } })
	} catch (error) {
		return handleError(error)
	}
}

async function fetchMedrxiv(query: string, page: number, perPage: number): Promise<Response> {
	try {
		const today = new Date()
		const thirtyDaysAgo = new Date(today)
		thirtyDaysAgo.setDate(today.getDate() - 30)
		const dateFormat = (date: Date) => {
			const year = date.getFullYear()
			const month = String(date.getMonth() + 1).padStart(2, "0")
			const day = String(date.getDate()).padStart(2, "0")
			return `${year}-${month}-${day}`
		}
		const cursor = page * perPage
		const url = `${MEDRXIV_API_URL}/${dateFormat(thirtyDaysAgo)}/${dateFormat(today)}/${cursor}/json`
		const response = await fetch(url)
		const data = await response.json() as MedrxivResponse
		if (!data.collection || !Array.isArray(data.collection)) {
			return new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } })
		}
		let results = data.collection
		if (query) {
			const queries = query.split("|").filter(Boolean).map(q => q.trim().toLowerCase())
			if (queries.length > 0) {
				results = results.filter((paper: any) => queries.some(q => {
					const terms = q.split(" ").filter(Boolean)
					return terms.every(term => paper.title.toLowerCase().includes(term) || paper.abstract.toLowerCase().includes(term))
				}))
			}
		}
		results = results.slice(0, perPage)
		const papers = results.map(transformMedrxivEntry)
		return new Response(JSON.stringify(papers), { headers: { "Content-Type": "application/json" } })
	} catch (error) {
		return handleError(error)
	}
}

async function fetchBiorxiv(query: string, page: number, perPage: number): Promise<Response> {
	try {
		const today = new Date()
		const thirtyDaysAgo = new Date()
		thirtyDaysAgo.setDate(today.getDate() - 30)
		const dateFormat = (date: Date) => {
			const year = date.getFullYear()
			const month = String(date.getMonth() + 1).padStart(2, "0")
			const day = String(date.getDate()).padStart(2, "0")
			return `${year}-${month}-${day}`
		}
		const cursor = page * perPage
		const url = `${BIORXIV_API_URL}/${dateFormat(thirtyDaysAgo)}/${dateFormat(today)}/${cursor}/${perPage}`
		const response = await fetch(url)
		const data = await response.json()
		const collection = data.collection || []
		let results = collection
		if (query) {
			const queries = query.split("|").map(q => q.trim().toLowerCase()).filter(Boolean)
			results = results.filter((paper: any) => queries.every(term => paper.title.toLowerCase().includes(term) || paper.abstract.toLowerCase().includes(term)))
		}
		const papers = results.map(transformBiorxivEntry)
		return new Response(JSON.stringify(papers), { headers: { "Content-Type": "application/json" } })
	} catch (error) {
		return handleError(error)
	}
}

async function fetchPubmed(query: string, page: number, perPage: number): Promise<Response> {
	const searchParams = new URLSearchParams()
	searchParams.append("db", "pubmed")
	searchParams.append("term", query)
	searchParams.append("retstart", (page * perPage).toString())
	searchParams.append("retmax", perPage.toString())
	searchParams.append("retmode", "json")
	const searchUrl = `${PUBMED_ESEARCH_URL}?${searchParams.toString()}`
	const searchResp = await fetch(searchUrl)
	const searchData = await searchResp.json()
	const idList = searchData.esearchresult?.idlist
	if (!idList || idList.length === 0) {
		return new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } })
	}
	const summaryParams = new URLSearchParams()
	summaryParams.append("db", "pubmed")
	summaryParams.append("id", idList.join(","))
	summaryParams.append("retmode", "json")
	const summaryUrl = `${PUBMED_ESUMMARY_URL}?${summaryParams.toString()}`
	const summaryResp = await fetch(summaryUrl)
	const summaryData = await summaryResp.json()
	const papers = idList.map((id: string) => transformPubmedEntry(summaryData.result[id]))
	return new Response(JSON.stringify(papers), { headers: { "Content-Type": "application/json" } })
}

async function fetchHackerNews(query: string, page: number, perPage: number): Promise<Response> {
    try {
        // First get story IDs
        const response = await fetch(`${HACKERNEWS_API_URL}/topstories.json`);
        const storyIds = await response.json();
        
        // Calculate pagination
        const start = page * perPage;
        const end = start + perPage;
        const pageIds = storyIds.slice(start, end);
        
        // Fetch individual stories in parallel
        const stories = await Promise.all(
            pageIds.map(async (id: number) => {
                const storyResponse = await fetch(`${HACKERNEWS_API_URL}/item/${id}.json`);
                return storyResponse.json();
            })
        );

        // Filter by query if needed
        let results = stories;
        if (query) {
            const queryLower = query.toLowerCase();
            results = results.filter((story: any) => 
                story.title.toLowerCase().includes(queryLower) ||
                (story.text || "").toLowerCase().includes(queryLower)
            );
        }

        const papers = results.map(transformHackerNewsEntry);
        return new Response(JSON.stringify(papers), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (error) {
        return handleError(error);
    }
}

function transformArxivEntry(entry: any) {
	const summaryText = entry.summary?.[0]?.replace(/\s+/g, " ").trim() || ""
	return {
		id: entry.id?.[0],
		title: entry.title?.[0]?.replace(/\s+/g, " ").trim(),
		summary: summaryText,
		addictiveSummary: {
			teaser: summaryText,
			full: summaryText
		},
		authors: entry.author?.map((author: any) => author.name?.[0]) || [],
		published: entry.published?.[0],
		pdfLink: entry.link?.find((link: any) => link.$?.title === "pdf")?.$?.href,
		source: "arxiv"
	}
}

function transformMedrxivEntry(entry: any) {
	const summaryText = entry.abstract
	return {
		id: entry.doi,
		title: entry.title,
		summary: summaryText,
		addictiveSummary: {
			teaser: summaryText,
			full: summaryText
		},
		authors: entry.authors.split("; "),
		published: entry.date,
		pdfLink: `https://www.medrxiv.org/content/${entry.doi}v${entry.version}.full.pdf`,
		source: "medrxiv",
		category: entry.category,
		institution: entry.author_corresponding_institution
	}
}

function transformBiorxivEntry(paper: any) {
	const summaryText = paper.abstract
	return {
		id: paper.doi,
		title: paper.title,
		summary: summaryText,
		addictiveSummary: {
			teaser: summaryText,
			full: summaryText
		},
		authors: paper.authors ? paper.authors.split("; ") : [],
		published: paper.date,
		pdfLink: paper.link || null,
		source: "biorxiv"
	}
}

function transformPubmedEntry(doc: any) {
	return {
		id: doc.uid,
		title: doc.title,
		summary: doc.title,
		addictiveSummary: {
			teaser: doc.title,
			full: doc.title
		},
		authors: doc.authors ? doc.authors.map((a: any) => a.name) : [],
		published: doc.pubdate,
		pdfLink: null,
		source: "pubmed"
	}
}

function transformHackerNewsEntry(story: any) {
    const summaryText = story.text || story.title;
    return {
        id: `hn-${story.id}`,
        title: story.title,
        summary: summaryText,
        addictiveSummary: {
            teaser: summaryText,
            full: summaryText
        },
        authors: [story.by],
        published: new Date(story.time * 1000).toISOString(),
        pdfLink: story.url,
        source: "hackernews"
    };
}

function handleError(error: any) {
	console.error(error)
	return new Response(JSON.stringify({ error: "Failed to fetch papers" }), {
		status: 500,
		headers: { "Content-Type": "application/json" }
	})
}
