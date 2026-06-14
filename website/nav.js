/* Tiger docs — shared chrome. A page only needs a <head> that links
   /tiger/styles.css and a single <article> in the body; this script builds the
   top bar, sidebar, right-hand TOC, prev/next and footer around it, and wires
   theme, search filter and the mobile menu. Single source of truth for nav. */
(function () {
  'use strict'

  var BASE = '/tiger'

  // ---- Navigation tree (the one place links are defined) ------------------
  var NAV = [
    {
      label: 'Getting started',
      items: [
        { t: 'What is Tiger', h: '/docs/getting-started/' },
        { t: 'Install Tiger', h: '/docs/install/' },
        { t: 'Your first request', h: '/docs/first-request/' }
      ]
    },
    {
      label: 'Concepts',
      items: [
        { t: 'The .tiger format', h: '/docs/tiger-format/' },
        { t: 'Collections & folders', h: '/docs/collections/' },
        { t: 'Variables & environments', h: '/docs/variables/' }
      ]
    },
    {
      label: 'Features',
      items: [
        { t: 'Requests & auth', h: '/docs/requests-auth/' },
        { t: 'Environments & secrets', h: '/docs/environments/' },
        { t: 'Scripts & captures', h: '/docs/scripts/' },
        { t: 'Collection runner', h: '/docs/runner/' },
        { t: 'Response tools', h: '/docs/response/' },
        { t: 'Importing (incl. WSDL/SOAP)', h: '/docs/importing/' },
        { t: 'Git workflow', h: '/docs/git/' },
        { t: 'MCP server', h: '/docs/mcp/' }
      ]
    },
    {
      label: 'Compare',
      items: [
        { t: 'Tiger vs the field', h: '/compare/' },
        { t: 'Tiger vs Postman', h: '/compare/tiger-vs-postman/' },
        { t: 'Tiger vs Bruno', h: '/compare/tiger-vs-bruno/' },
        { t: 'Tiger vs Insomnia', h: '/compare/tiger-vs-insomnia/' },
        { t: 'Tiger vs Hoppscotch', h: '/compare/tiger-vs-hoppscotch/' }
      ]
    },
    {
      label: 'Guides',
      items: [
        { t: 'Postman → Tiger migration', h: '/guides/postman-to-tiger/' },
        { t: 'A free Postman alternative', h: '/alternatives/postman/' },
        { t: 'An AI/MCP API client', h: '/use-cases/mcp-api-client/' }
      ]
    },
    {
      label: 'Reference',
      items: [{ t: 'FAQ', h: '/docs/faq/' }]
    }
  ]

  // ---- Small helpers ------------------------------------------------------
  function el(html) {
    var t = document.createElement('template')
    t.innerHTML = html.trim()
    return t.content.firstChild
  }
  function norm(path) {
    path = path.replace(/index\.html$/, '')
    if (path.charAt(path.length - 1) !== '/') path += '/'
    return path
  }
  function svg(p) {
    return (
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      p +
      '</svg>'
    )
  }

  var here = norm(location.pathname)
  var flat = []
  NAV.forEach(function (g) {
    g.items.forEach(function (i) {
      flat.push(i)
    })
  })

  // ---- Theme --------------------------------------------------------------
  function applyTheme(mode) {
    var dark = mode === 'dark' || (mode !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }
  var savedTheme = localStorage.getItem('tiger-theme') || 'system'
  applyTheme(savedTheme)

  // ---- Build chrome -------------------------------------------------------
  function build() {
    var article = document.querySelector('article')
    if (!article) return
    var noToc = article.hasAttribute('data-no-toc')

    // Top bar
    var topbar = el(
      '<header class="topbar">' +
        '<button class="icon-btn menu-toggle" aria-label="Menu">' + svg('<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>') + '</button>' +
        '<a class="brand" href="' + BASE + '/"><img src="' + BASE + '/icon.png" alt="Tiger"/>Tiger <span class="v">docs</span></a>' +
        '<div class="grow"></div>' +
        '<div class="search">' + svg('<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>') + '<input id="nav-filter" type="search" placeholder="Filter docs…" aria-label="Filter docs"/></div>' +
        '<a class="tb-link" href="https://github.com/jtaoufik/tiger" rel="noopener">' + svg('<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>') + 'GitHub</a>' +
        '<button class="icon-btn" id="theme-toggle" aria-label="Toggle theme"></button>' +
      '</header>'
    )

    // Sidebar
    var sideInner = ''
    NAV.forEach(function (g) {
      sideInner += '<div class="group"><div class="label">' + g.label + '</div>'
      g.items.forEach(function (i) {
        var href = BASE + i.h
        var active = norm(href) === here ? ' active' : ''
        sideInner += '<a class="navlink' + active + '" href="' + href + '">' + i.t + '</a>'
      })
      sideInner += '</div>'
    })
    var sidebar = el('<aside class="sidebar" id="sidebar">' + sideInner + '</aside>')
    var scrim = el('<div class="scrim" id="scrim"></div>')

    // Layout: move the existing <article> into the content column
    var main = el('<div class="main"><div class="content"></div>' + (noToc ? '' : '<nav class="toc" id="toc"></nav>') + '</div>')
    var layout = el('<div class="layout"></div>')
    var parent = article.parentNode
    var contentCol = main.querySelector('.content')
    parent.insertBefore(layout, article)
    layout.appendChild(sidebar)
    layout.appendChild(main)
    contentCol.appendChild(article)

    // prev / next
    var idx = -1
    for (var k = 0; k < flat.length; k++) if (norm(BASE + flat[k].h) === here) idx = k
    if (idx !== -1) {
      var pn = el('<nav class="page-nav"></nav>')
      if (flat[idx - 1]) pn.appendChild(el('<a class="prev" href="' + BASE + flat[idx - 1].h + '"><span class="dir">← Previous</span><span class="ttl">' + flat[idx - 1].t + '</span></a>'))
      else pn.appendChild(el('<span></span>'))
      if (flat[idx + 1]) pn.appendChild(el('<a class="next" href="' + BASE + flat[idx + 1].h + '"><span class="dir">Next →</span><span class="ttl">' + flat[idx + 1].t + '</span></a>'))
      contentCol.appendChild(pn)
    }

    // Footer
    document.body.appendChild(
      el(
        '<footer class="footer"><span>Tiger — free, open source, git-native API client.</span>' +
          '<a href="https://github.com/jtaoufik/tiger">GitHub</a>' +
          '<a href="' + BASE + '/privacy/">Privacy</a>' +
          '<a href="https://github.com/jtaoufik/tiger/releases/latest">Download</a></footer>'
      )
    )
    document.body.insertBefore(topbar, document.body.firstChild)
    document.body.appendChild(scrim)

    // ---- TOC from headings ----
    if (!noToc) {
      var toc = document.getElementById('toc')
      var heads = article.querySelectorAll('h2, h3')
      if (heads.length > 1) {
        var html = '<div class="label">On this page</div>'
        heads.forEach(function (h) {
          if (!h.id) h.id = h.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          html += '<a class="' + h.tagName.toLowerCase() + '" href="#' + h.id + '">' + h.textContent + '</a>'
        })
        toc.innerHTML = html
        var links = toc.querySelectorAll('a')
        var spy = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (e) {
              if (e.isIntersecting) {
                links.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id) })
              }
            })
          },
          { rootMargin: '-70px 0px -70% 0px' }
        )
        heads.forEach(function (h) { spy.observe(h) })
      } else {
        toc.remove()
      }
    }

    // ---- Theme toggle ----
    var tt = document.getElementById('theme-toggle')
    function paintToggle() {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark'
      tt.innerHTML = dark
        ? svg('<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/>')
        : svg('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>')
    }
    paintToggle()
    tt.addEventListener('click', function () {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark'
      var next = dark ? 'light' : 'dark'
      localStorage.setItem('tiger-theme', next)
      applyTheme(next)
      paintToggle()
    })

    // ---- Sidebar filter ----
    var filter = document.getElementById('nav-filter')
    filter.addEventListener('input', function () {
      var q = filter.value.trim().toLowerCase()
      sidebar.querySelectorAll('.group').forEach(function (g) {
        var any = false
        g.querySelectorAll('.navlink').forEach(function (a) {
          var hit = a.textContent.toLowerCase().indexOf(q) !== -1
          a.classList.toggle('hidden', q && !hit)
          if (hit) any = true
        })
        g.style.display = q && !any ? 'none' : ''
      })
    })

    // ---- Mobile menu ----
    function setMenu(open) {
      sidebar.classList.toggle('open', open)
      scrim.classList.toggle('show', open)
    }
    topbar.querySelector('.menu-toggle').addEventListener('click', function () { setMenu(!sidebar.classList.contains('open')) })
    scrim.addEventListener('click', function () { setMenu(false) })
    sidebar.addEventListener('click', function (e) { if (e.target.tagName === 'A') setMenu(false) })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build)
  else build()
})()
