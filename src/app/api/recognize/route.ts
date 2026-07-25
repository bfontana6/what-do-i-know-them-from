import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

let _ai: GoogleGenAI | null = null;
const getAI = () => {
  if (!_ai) _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return _ai;
};

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const image = formData.get('image') as File | null;

        if (!image) {
            return NextResponse.json({ error: 'No image provided' }, { status: 400 });
        }

        // Convert File to Buffer/Base64 for Gemini
        const bytes = await image.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64Image = buffer.toString('base64');
        let mimeType = image.type || 'image/jpeg';
        if (mimeType === 'application/octet-stream') {
            mimeType = 'image/jpeg';
        }
        console.log(`Processing image with mimeType: ${mimeType}`);

        // Call gemini-2.5-flash (fast and cost-effective for vision tasks)
        const response = await getAI().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: "Identify the single most prominent actor or actress in this image. Reply with ONLY their full name. If you cannot identify anyone, reply exactly with 'UNKNOWN'." },
                        {
                            inlineData: {
                                data: base64Image,
                                mimeType: mimeType,
                            }
                        }
                    ]
                }
            ],
            config: {
                temperature: 0.1, // Low temperature for factual identification
            }
        });

        const recognizedName = response.text?.trim();

        if (!recognizedName || recognizedName === 'UNKNOWN') {
            return NextResponse.json({ error: 'No recognizable actor found in the image' }, { status: 404 });
        }

        // Gemini returns the name directly based on our prompt
        return NextResponse.json({
            success: true,
            actor: {
                name: recognizedName,
            }
        });

    } catch (error: any) {
        console.error('Error recognizing image with Gemini:', error);

        let errorMessage = 'Failed to process image';
        let statusCode = 500;

        // The new GenAI SDK often throws an ApiError with a nested error object
        if (error.error && error.error.status === 'RESOURCE_EXHAUSTED') {
            errorMessage = 'API Rate Limit Exceeded. Please wait 30 seconds and try again.';
            statusCode = 429;
        } else if (error.error && error.error.message) {
            errorMessage = error.error.message;
            statusCode = error.error.code || 500;
        } else if (error.message) {
            errorMessage = error.message;
            if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota')) {
                errorMessage = 'API Rate Limit Exceeded. Please wait 30 seconds and try again.';
                statusCode = 429;
            }
        }

        return NextResponse.json({ error: errorMessage }, { status: statusCode });
    }
}
