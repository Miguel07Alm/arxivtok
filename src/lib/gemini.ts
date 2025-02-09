import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL_NAME = "gemini-2.0-flash";

// Initialize Gemini API with environment variable
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Cache for storing simplified abstracts
const abstractCache = new Map<string, string>();

export async function simplifyAbstract(abstract: string): Promise<string> {
  // Check if result is in cache
  const cachedResult = abstractCache.get(abstract);
  if (cachedResult) {
    return cachedResult;
  }

  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    
    const prompt = `You are given an academic paper abstract:

<abstract>
${abstract}
</abstract>

Rewrite this academic paper abstract in plain English that is easy to understand.
Keep the main points and findings, but make it more accessible to a general audience.
Reply directly with the content, do not include preamble like "Here is the simplified abstract" or anything else.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const simplifiedAbstract = response.text();
    
    // Store in cache
    abstractCache.set(abstract, simplifiedAbstract);
    
    return simplifiedAbstract;
  } catch (error) {
    console.error("Error simplifying abstract with Gemini:", error);
    // Return original abstract if processing fails
    return abstract;
  }
} 