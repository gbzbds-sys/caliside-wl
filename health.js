export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    service: 'CaliSide WL API',
    version: 'CALISIDE-PROPRE-FINAL-2026-08-29'
  });
}
