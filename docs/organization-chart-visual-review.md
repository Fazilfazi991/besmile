# Organization chart visual review

These are Playwright browser-emulation captures at normal browser zoom, not real-device screenshots. No Production employee data was used.

The legacy **before** image uses a synthetic **31-active-person** directory and shows the old fixed-width flex tree cropping a wide team. The updated **after** matrix uses one consistent synthetic **32-active-person** directory at every viewport: four legitimate roots, eleven direct reports to the General Manager, deeper reports, and one QA viewer. The before and after datasets differ by that QA viewer and should not be treated as a pixel-matched comparison.

![Legacy 31-person wide chart](organization-chart-visual/before-desktop-large.png)

For the 32-person chart, all roots and first-tier employees remain in the graph. Deeper branches start collapsed. The initial camera favors legible cards over shrinking the entire wide team; pan to see other reports, use List for the complete hierarchy, or choose Fit chart to zoom out explicitly. Expanding a branch from List focuses that branch and its child when returning to Chart.

| Viewport | Standard initial | Standard branch expanded | Colorful initial | Colorful branch expanded |
| --- | --- | --- | --- | --- |
| 1366 × 768 desktop | [Chart](organization-chart-visual/chromium-large-1366-standard-initial-chart.png) | [Chart](organization-chart-visual/chromium-large-1366-standard-expanded-chart.png) | [Chart](organization-chart-visual/chromium-large-1366-colorful-initial-chart.png) | [Chart](organization-chart-visual/chromium-large-1366-colorful-expanded-chart.png) |
| 1024 × 768 landscape | [Chart](organization-chart-visual/chromium-large-1024-standard-initial-chart.png) | [Chart](organization-chart-visual/chromium-large-1024-standard-expanded-chart.png) | [Chart](organization-chart-visual/chromium-large-1024-colorful-initial-chart.png) | [Chart](organization-chart-visual/chromium-large-1024-colorful-expanded-chart.png) |
| 768 × 900 portrait | [Chart](organization-chart-visual/chromium-large-768-standard-initial-chart.png) | [Chart](organization-chart-visual/chromium-large-768-standard-expanded-chart.png) | [Chart](organization-chart-visual/chromium-large-768-colorful-initial-chart.png) | [Chart](organization-chart-visual/chromium-large-768-colorful-expanded-chart.png) |
| 390 × 844 mobile | [Default List](organization-chart-visual/chromium-large-390-standard-initial-list.png) · [Chart](organization-chart-visual/chromium-large-390-standard-initial-chart.png) | [Chart](organization-chart-visual/chromium-large-390-standard-expanded-chart.png) | [Default List](organization-chart-visual/chromium-large-390-colorful-initial-list.png) · [Chart](organization-chart-visual/chromium-large-390-colorful-initial-chart.png) | [Chart](organization-chart-visual/chromium-large-390-colorful-expanded-chart.png) |

The same 32-person fixture also passed in Playwright WebKit. Its full evidence matrix is below.

| Viewport | Standard initial | Standard branch expanded | Colorful initial | Colorful branch expanded |
| --- | --- | --- | --- | --- |
| 1366 × 768 desktop | [Chart](organization-chart-visual/webkit-large-1366-standard-initial-chart.png) | [Chart](organization-chart-visual/webkit-large-1366-standard-expanded-chart.png) | [Chart](organization-chart-visual/webkit-large-1366-colorful-initial-chart.png) | [Chart](organization-chart-visual/webkit-large-1366-colorful-expanded-chart.png) |
| 1024 × 768 landscape | [Chart](organization-chart-visual/webkit-large-1024-standard-initial-chart.png) | [Chart](organization-chart-visual/webkit-large-1024-standard-expanded-chart.png) | [Chart](organization-chart-visual/webkit-large-1024-colorful-initial-chart.png) | [Chart](organization-chart-visual/webkit-large-1024-colorful-expanded-chart.png) |
| 768 × 900 portrait | [Chart](organization-chart-visual/webkit-large-768-standard-initial-chart.png) | [Chart](organization-chart-visual/webkit-large-768-standard-expanded-chart.png) | [Chart](organization-chart-visual/webkit-large-768-colorful-initial-chart.png) | [Chart](organization-chart-visual/webkit-large-768-colorful-expanded-chart.png) |
| 390 × 844 mobile | [Default List](organization-chart-visual/webkit-large-390-standard-initial-list.png) · [Chart](organization-chart-visual/webkit-large-390-standard-initial-chart.png) | [Chart](organization-chart-visual/webkit-large-390-standard-expanded-chart.png) | [Default List](organization-chart-visual/webkit-large-390-colorful-initial-list.png) · [Chart](organization-chart-visual/webkit-large-390-colorful-initial-chart.png) | [Chart](organization-chart-visual/webkit-large-390-colorful-expanded-chart.png) |
