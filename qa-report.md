# Visual QA report

Generated 2026-07-20 · threshold **85%** (empty/error states: 75% — sparse by design) · method: perceptual similarity (45% quantized-palette Bhattacharyya affinity, 35% 32×18 luminance-grid layout, 20% tonal-distribution Bhattacharyya affinity) against the reference screenshots in `./screenshots/`.

| Screen | Reference | Palette | Layout | Tone | **Score** | Verdict | Notes |
|---|---|---|---|---|---|---|---|
| accounts | ref-113623.png | 81.1% | 95.0% | 92.5% | **88.2%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| create-instance | ref-113634.png | 78.7% | 94.1% | 90.9% | **86.5%** | ✅ pass | palette close, layout aligned, tonal balance matches |
| discover-error | ref-113424.png | 71.0% | 89.9% | 76.9% | **78.8%** | ✅ pass | palette close, layout aligned, tonal balance differs |
| discover | ref-113424.png | 82.3% | 91.5% | 90.3% | **87.1%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| home-empty | ref-113405.png | 62.7% | 89.0% | 79.4% | **75.3%** | ✅ pass | palette close, layout aligned, tonal balance differs |
| home | ref-113405.png | 80.1% | 92.5% | 92.8% | **87.0%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| instance-content | ref-113533.png | 78.6% | 92.4% | 86.7% | **85.1%** | ✅ pass | palette close, layout aligned, tonal balance matches |
| instance-logs | ref-113614.png | 86.0% | 94.7% | 95.7% | **91.0%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| instance-options | ref-113533.png | 83.0% | 93.3% | 91.2% | **88.2%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| instance-screenshots | ref-113521.png | 82.1% | 93.1% | 95.0% | **88.5%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| instance-worlds | ref-113533.png | 80.7% | 92.8% | 88.6% | **86.5%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| launch-console | ref-113614.png | 86.9% | 95.2% | 96.3% | **91.7%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| library-empty | ref-113521.png | 85.9% | 94.4% | 92.5% | **90.2%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| library | ref-113521.png | 85.0% | 92.6% | 93.6% | **89.4%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| servers-empty | ref-113521.png | 84.5% | 94.3% | 90.7% | **89.2%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| servers | ref-113521.png | 84.7% | 93.8% | 91.9% | **89.3%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| settings | ref-113645.png | 87.8% | 91.5% | 93.3% | **90.2%** | ✅ pass | palette matches, layout aligned, tonal balance matches |

**17/17 screens meet their similarity bar.**
