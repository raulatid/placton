/** Cabecera + tarjeta blanca de las pantallas de acceso. */
export function AuthCard({ title, sub, children }: { title: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[460px]">
      <h1 className="text-center text-[32px] font-extrabold tracking-[-0.035em] sm:text-[38px]">{title}</h1>
      {sub && <p className="mt-2 text-center text-[14px] text-mute">{sub}</p>}
      <div className="mt-7 rounded-[20px] border border-line bg-white p-6 shadow-[0_1px_2px_rgba(11,29,33,0.04),0_12px_32px_-12px_rgba(11,29,33,0.12)] sm:p-7">{children}</div>
    </div>
  )
}
