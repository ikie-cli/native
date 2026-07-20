# Visual QA report

Generated 2026-07-20 · threshold **85%** (empty/error states: 75% — sparse by design) · method: perceptual similarity (45% quantized-palette Bhattacharyya affinity, 35% 32×18 luminance-grid layout, 20% tonal-distribution Bhattacharyya affinity) against the reference screenshots in `./screenshots/`.

| Screen | Reference | Palette | Layout | Tone | **Score** | Verdict | Notes |
|---|---|---|---|---|---|---|---|
| accounts | ref-113623.png | 82.6% | 95.3% | 95.2% | **89.6%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| create-instance | ref-113634.png | 80.6% | 94.0% | 93.2% | **87.8%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| discover-error | ref-113424.png | 74.9% | 90.4% | 81.1% | **81.6%** | ✅ pass | palette close, layout aligned, tonal balance differs |
| discover | ref-113424.png | 83.5% | 92.1% | 91.8% | **88.1%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| home-empty | ref-113405.png | 66.6% | 89.5% | 83.2% | **77.9%** | ✅ pass | palette close, layout aligned, tonal balance differs |
| home | ref-113405.png | 80.3% | 93.0% | 92.8% | **87.2%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| instance-content | ref-113533.png | 80.6% | 92.9% | 88.9% | **86.6%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| instance-logs | ref-113614.png | 86.4% | 95.3% | 96.0% | **91.4%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| instance-options | ref-113533.png | 83.0% | 94.0% | 91.2% | **88.5%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| instance-screenshots | ref-113533.png | 76.9% | 92.3% | 92.7% | **85.5%** | ✅ pass | palette close, layout aligned, tonal balance matches |
| instance-worlds | ref-113533.png | 81.6% | 93.3% | 89.8% | **87.3%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| launch-console | ref-113614.png | 86.5% | 95.6% | 96.1% | **91.6%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| library-empty | ref-113521.png | 86.4% | 94.9% | 93.1% | **90.7%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| library | ref-113521.png | 83.8% | 93.1% | 92.8% | **88.8%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| servers-empty | ref-113521.png | 85.2% | 94.8% | 91.6% | **89.8%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| servers | ref-113521.png | 83.2% | 94.3% | 90.5% | **88.6%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| settings | ref-113645.png | 89.6% | 93.1% | 95.7% | **92.0%** | ✅ pass | palette matches, layout aligned, tonal balance matches |

**17/17 screens meet their similarity bar.**
