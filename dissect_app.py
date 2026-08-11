import re

with open('private/app/dashboard.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Nav links: Keep only My Wellness
html = re.sub(
    r'<nav class="nav" role="navigation" aria-label="Primary">.*?</nav>',
    '<nav class="nav" role="navigation" aria-label="Primary"><button class="nav-item active">My Wellness</button></nav>',
    html,
    flags=re.DOTALL
)

# 2. Remove Landing View
html = re.sub(r'<!-- ============ LANDING VIEW ============ -->.*?</section>', '', html, 1, flags=re.DOTALL)

# 3. Remove HR View
html = re.sub(r'<!-- ============ HR VIEW ============ -->.*?</section>', '', html, 1, flags=re.DOTALL)

# 4. Make sure view-employee doesn't have style="display:none"
html = html.replace('<section class="view" id="view-employee"', '<section class="view active" id="view-employee" style="display:block;"')

# 5. Add wellness.js script to the head
html = html.replace('</head>', '  <script src="/js/wellness.js"></script>\n</head>')

with open('private/app/dashboard.html', 'w', encoding='utf-8') as f:
    f.write(html)
