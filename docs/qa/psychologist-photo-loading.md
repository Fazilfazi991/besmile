# Psychologist photo loading

7 October 2026. Production baseline: 73170bbc653724d4d0c3de7e216bd94af5e1f893.

The organization cards downloaded full-size private portraits for small avatars, issued a separate signing request per photo on every refresh, and retained failed-image state in external cards. The 13 assigned external portraits total 11,938,207 bytes. Anjaly has no assigned avatar or stored photo object.

The chart now signs distinct current avatar paths in one batch, reuses valid links, renews before expiry, and removes stale paths when fresh authorized directory records change. All chart/list/external avatars and the profile header use 96px WebP thumbnails. Initials remain visible during loading; one bounded retry recovers transient failures. External avatars reset failed state when the source changes. The full photo viewer continues to use the original signed photo.

The thumbnail endpoint accepts only this project's signed profile-photo paths. Storage validates each supplied capability before resizing. Foreign hosts, other buckets, traversal, redirects and expired links are rejected. Source bytes and decoded dimensions are bounded. Responses are private, CDN caching is disabled, and browser caching never exceeds token expiry. No service-role credentials, database changes, image-file rewrites, bucket visibility changes, account changes or availability changes are included.

Validation: 29 focused tests pass, typecheck passes, lint has zero errors and 25 existing warnings. Full regression: 1,393 passed, the same seven documented baseline failures, no new failures. Production build and browser/byte measurements are recorded in ignored release-evidence/staff-access.
