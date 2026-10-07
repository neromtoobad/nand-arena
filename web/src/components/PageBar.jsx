/** The one title strip every page uses, so pages share the same frame. */
export default function PageBar({ eyebrow, title, children }) {
  return (
    <div className="pagebar">
      <div className="wrap">
        <div style={{ minWidth: 0 }}>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
        </div>
        {children && <div className="acts">{children}</div>}
      </div>
    </div>
  );
}
