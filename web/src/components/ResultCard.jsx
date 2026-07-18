// A ranked research item (from Raven). Reused by the Raven page and Quill's "latest search" card.
export default function ResultCard({ item }) {
  return (
    <div className="card result-card">
      <div className="result-head">
        {item.rank != null && <span className="result-rank">#{item.rank}</span>}
        <span className="result-title">{item.title}</span>
        {item.trendingScore != null && <span className="result-score">{item.trendingScore}</span>}
      </div>
      <div className="result-meta">
        <span>{item.source}</span>
        {item.postPotential && <span>{item.postPotential}</span>}
        {item.publisher && <span>{item.publisher}</span>}
      </div>
      {item.why && <div className="result-why">{item.why}</div>}
      {item.url && <a className="result-url" href={item.url} target="_blank" rel="noreferrer">{item.url}</a>}
    </div>
  )
}
