import s from './Navbar.module.css'
import Logo from './Logo'

export default function Navbar({ effects, effectId, onEffectChange }) {
  return (
    <header className={s.nav}>
      <div className={s.brand}>
        <Logo className={s.mark} />
        Croma Backgrounds
      </div>
      <nav className={s.tabs} aria-label="Efectos">
        {effects.map((e) => {
          const active = e.id === effectId
          return (
            <button
              key={e.id}
              type="button"
              className={`${s.tab} ${active ? s.tabActive : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => onEffectChange(e.id)}
            >
              {e.name}
            </button>
          )
        })}
      </nav>
    </header>
  )
}
