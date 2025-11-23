import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const apiKey = (process.env.GOOGLE_API_KEY || "").trim()
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY! // Важно: Service Role Key для записи без авторизации

const genAI = new GoogleGenerativeAI(apiKey)
const supabase = createClient(sbUrl, sbKey)

export async function POST(req: Request) {
  try {
    const { answers, language } = await req.json()

    // 1. GEMINI ANALYTICS
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    
    const langInstruction = language === 'ru' 
      ? 'ANSWER STRICTLY IN RUSSIAN.' 
      : 'ANSWER STRICTLY IN ENGLISH.'

    const prompt = `
      ROLE: You are THE MERKUROV ANALYZER.
      TASK: Analyze the user based on 10 answers.
      
      STEP 1: CLASSIFY. Based on answers, choose ONE archetype:
      - [ARCHETYPE: VOID] (Empty, depressed, burnt out)
      - [ARCHETYPE: NOISE] (Chaotic, vain, addicted to social media)
      - [ARCHETYPE: STONE] (Traumatized, heavy, stuck in past)
      - [ARCHETYPE: UNFRAMED] (Rare. Creative, strong, independent)
      
      STEP 2: ANALYZE. Write the report.
      
      USER ANSWERS:
      ${answers.map((a: string, i: number) => `${i + 1}. ${a}`).join('\n')}

      INSTRUCTION: ${langInstruction}
      
      OUTPUT FORMAT:
      [ARCHETYPE: ...] 
      
      # SUBJECT ANALYSIS
      
      ## I. EXECUTIVE SUMMARY
      [2 sentences psychoanalysis]
      
      ## II. STRUCTURAL INTEGRITY
      [Trauma analysis]
      
      ## III. DIGITAL FOOTPRINT
      [Vanity analysis]
      
      ## IV. STRATEGIC DIRECTIVE
      [One imperative command]
    `

    const result = await model.generateContent(prompt)
    const fullText = await result.response.text()

    // 2. PARSING (Вытаскиваем штамп и чистый текст)
    let archetype = 'VOID'
    let cleanText = fullText

    const match = fullText.match(/\[ARCHETYPE:\s*(.*?)\]/)
    if (match) {
        archetype = match[1].trim()
        cleanText = fullText.replace(match[0], '').trim()
    }

    // 3. DATABASE SAVE (Сохраняем "Сырой" лид)
    const { data: record, error } = await supabase
        .from('casts')
        .insert({
            answers,
            language,
            analysis: cleanText,
            archetype: archetype
        })
        .select()
        .single()

    if (error) console.error('Supabase Error:', error)

    return NextResponse.json({ 
        analysis: cleanText, 
        archetype: archetype,
        recordId: record?.id // Возвращаем ID, чтобы потом обновить Email
    })

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Core Failure' }, { status: 500 })
  }
}