import { NextResponse, type NextRequest } from 'next/server'
import { handleWebhook } from '@/lib/stripe'

// Stripe necesita el cuerpo tal cual llega para verificar la firma.
export async function POST(req: NextRequest) {
  const body = await req.text()
  const res = await handleWebhook(body, req.headers.get('stripe-signature'))
  return NextResponse.json({ message: res.message }, { status: res.status })
}
