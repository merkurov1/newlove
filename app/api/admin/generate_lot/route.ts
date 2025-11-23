import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const apiKey = (process.env.GOOGLE_API_KEY || "").trim()
const genAI = new GoogleGenerativeAI(apiKey)

export async function POST(req: Request) {
  try {
    const { rawText, artist, title, link } = await req.json()

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

      OUTPUT REQUIREMENTS (JSON):
      
      1. "website":
         - "curator_note": A 3-paragraph essay. 
           Para 1: Analysis of the visual/atmosphere.
           Para 2: Historical context.
           Para 3: "Why it matters" (Market context, arbitrage, value).
         - "specs": Format details list (Medium, Size, Date, Provenance).

      2. "telegram":
         - Strict Markdown V1 formatting (use single * for bold).
         - NO estimates in the text.
         - Structure:
           *SELECTION: [TITLE IN CAPS]*
           (Empty Line)
           Intro hook about the market blindness.
           (Empty Line)
           *Artist Name*
           _Title_
           (Empty Line)
           Description (Atmosphere, why it's granite/silence).
           (Empty Line)
           Why buy: (Investment thesis).
           (Empty Line)
           *Подробный разбор лота:*
           [Читать на сайте](${link})

      3. "socials":
         - Short, punchy text (max 200 chars) for Twitter.
         - English.
         - Include Link.

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