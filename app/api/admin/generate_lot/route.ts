import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const apiKey = (process.env.GOOGLE_API_KEY || "").trim()
const genAI = new GoogleGenerativeAI(apiKey)

export async function POST(req: Request) {
  try {
    const { rawText, artist, title, link } = await req.json()

    // Используем Flash модель (она быстрее и дешевле)
    const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.5-flash',
        generationConfig: { responseMimeType: "application/json" } 
    })

    const prompt = `
      ROLE: You are Anton Merkurov, an elite Art Advisor. 
      STYLE: Snobbish, Architectural, Noir, concise. You value "Granite" (history) and "Silence". You hate "Noise" (pop-art).
      
      TASK: Rewrite the raw auction data into 3 formats.

      INPUT DATA:
      Artist: ${artist}
      Title: ${title}
      Link: ${link}
      Raw Info: ${rawText}

      OUTPUT REQUIREMENTS (Return valid JSON):
      
      1. "website_formatted":
         - MUST follow this EXACT structure:
           
           The Heading
           [Artist Name (Dates)]
           [Title]

           The Curator’s Note
           [Bold Headline, e.g. "The Canvas of Dissent" or "The Red Rhythm"]
           [Paragraph 1: Visual analysis. Atmosphere. Use words like "Silence", "Structure", "Rhythm".]
           [Paragraph 2: Historical context without boring details.]
           
           Why it matters: [One strong paragraph. Mention "Arbitrage", "Unique Work", "Undervalued" or "Granite vs Noise".]

           The Specs (Footer)
           Details:
           [Medium]
           [Dimensions]
           [Signed/Date]
           [Provenance summary]

           Market Context:
           Auction: [Auction House]
           Date: [Date]
           Estimate: [Price Range]

      2. "telegram":
         - Strict Markdown V1 formatting (use single * for bold, _ for italic).
         - Structure:
           *SELECTION: [SHORT TITLE CAPS]*
           
           [Short intro hook about market blindness/hype]
           
           *[Artist Name]*
           _[Title]_
           
           [Description of the work. 2-3 sentences. Focus on visual weight.]
           
           [Investment Thesis: Why is this a "Hidden Gem" or "Granite"?]
           
           *Подробный разбор лота:*
           [Читать на сайте](${link})

      3. "socials":
         - Short tweet (English). Max 280 chars.
         - Hook + Link.

      RETURN JSON ONLY.
    `

    const result = await model.generateContent(prompt)
    const jsonResponse = JSON.parse(result.response.text())

    return NextResponse.json(jsonResponse)

  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}