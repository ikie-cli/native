# Visual QA report

Generated 2026-07-23 · threshold **85%** (empty/error states: 75% — sparse by design) · method: perceptual similarity (45% quantized-palette Bhattacharyya affinity, 35% 32×18 luminance-grid layout, 20% tonal-distribution Bhattacharyya affinity) against the reference screenshots in `./screenshots/`.

| Screen | Reference | Palette | Layout | Tone | **Score** | Verdict | Notes |
|---|---|---|---|---|---|---|---|
| accounts | ref-113623.png | 84.3% | 95.0% | 93.7% | **89.9%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| create-instance | ref-113634.png | 82.0% | 94.1% | 91.9% | **88.2%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| discover-error | ref-113424.png | 71.6% | 89.9% | 77.3% | **79.1%** | ✅ pass | palette close, layout aligned, tonal balance differs |
| discover | ref-113424.png | 82.5% | 91.5% | 90.5% | **87.3%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| home-empty | ref-113405.png | 75.0% | 90.5% | 83.9% | **82.2%** | ✅ pass | palette close, layout aligned, tonal balance differs |
| home | ref-113405.png | 81.3% | 92.4% | 93.0% | **87.5%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| instance-content | ref-113533.png | 78.6% | 92.4% | 86.8% | **85.1%** | ✅ pass | palette close, layout aligned, tonal balance matches |
| instance-logs | ref-113614.png | 86.0% | 94.6% | 95.8% | **91.0%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| instance-options | ref-113533.png | 83.0% | 93.3% | 91.3% | **88.2%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| instance-screenshots | ref-113521.png | 82.1% | 93.1% | 94.9% | **88.5%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| instance-worlds | ref-113533.png | 80.7% | 92.8% | 88.7% | **86.5%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| launch-console | ref-113614.png | 87.1% | 95.2% | 96.7% | **91.8%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| library-empty | ref-113521.png | 85.9% | 94.4% | 92.4% | **90.2%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| library | ref-113521.png | 85.0% | 92.5% | 93.6% | **89.4%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| ranked | ref-113533.png | 84.9% | 93.1% | 94.2% | **89.6%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| servers-empty | ref-113521.png | 84.6% | 94.2% | 90.8% | **89.2%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| servers | ref-113521.png | 81.1% | 93.0% | 93.2% | **87.7%** | ✅ pass | palette matches, layout aligned, tonal balance matches |
| settings | ref-113645.png | 89.3% | 91.3% | 94.2% | **91.0%** | ✅ pass | palette matches, layout aligned, tonal balance matches |

**18/18 screens meet their similarity bar.**
