<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0"
  xmlns:html="http://www.w3.org/TR/REC-html40"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html xmlns="http://www.w3.org/1999/xhtml" lang="en">
      <head>
        <title>XML Sitemap | Anton Merkurov</title>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style type="text/css">
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: #FAF8F5;
            color: #1a1a1a;
            margin: 0;
            padding: 40px 20px;
            line-height: 1.5;
          }
          .container {
            max-width: 1100px;
            margin: 0 auto;
          }
          header {
            border-bottom: 2px solid #1a1a1a;
            padding-bottom: 24px;
            margin-bottom: 32px;
          }
          h1 {
            font-family: Georgia, "Cormorant Garamond", serif;
            font-size: 38px;
            font-weight: 400;
            margin: 0 0 8px 0;
            letter-spacing: -0.02em;
          }
          .desc {
            font-size: 13px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.15em;
            margin: 0;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          }
          .stats {
            margin-top: 14px;
            font-size: 14px;
            color: #444;
          }
          .stats strong {
            color: #000;
            font-weight: 600;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            background: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
            border: 1px solid #e7e5e4;
          }
          th {
            background-color: #1c1917;
            color: #FAF8F5;
            text-align: left;
            padding: 14px 18px;
            font-size: 11px;
            letter-spacing: 0.15em;
            text-transform: uppercase;
            font-weight: 600;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          }
          td {
            padding: 12px 18px;
            border-bottom: 1px solid #f1f0ee;
            font-size: 13px;
            vertical-align: middle;
          }
          tr:last-child td {
            border-bottom: none;
          }
          tr:hover td {
            background-color: #fbfaf8;
          }
          a {
            color: #111827;
            text-decoration: none;
            word-break: break-all;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 12px;
          }
          a:hover {
            color: #b91c1c;
            text-decoration: underline;
          }
          .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 9999px;
            font-size: 11px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            background: #f4f3f0;
            color: #57534e;
          }
          .priority-high {
            background: #fef2f2;
            color: #991b1b;
            font-weight: 600;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #888;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <header>
            <h1>Anton Merkurov · Sitemap</h1>
            <p class="desc">Engineered for Search Indexation · merkurov.love</p>
            <div class="stats">
              Total URL count: <strong><xsl:value-of select="count(sitemap:urlset/sitemap:url)"/></strong>
            </div>
          </header>

          <table>
            <thead>
              <tr>
                <th style="width: 55%;">URL</th>
                <th style="width: 15%;">Change Freq</th>
                <th style="width: 15%;">Priority</th>
                <th style="width: 15%;">Last Modified</th>
              </tr>
            </thead>
            <tbody>
              <xsl:for-each select="sitemap:urlset/sitemap:url">
                <tr>
                  <td>
                    <a>
                      <xsl:attribute name="href">
                        <xsl:value-of select="sitemap:loc"/>
                      </xsl:attribute>
                      <xsl:value-of select="sitemap:loc"/>
                    </a>
                  </td>
                  <td>
                    <span class="badge">
                      <xsl:value-of select="sitemap:changefreq"/>
                    </span>
                  </td>
                  <td>
                    <span>
                      <xsl:choose>
                        <xsl:when test="number(sitemap:priority) &gt;= 0.8">
                          <xsl:attribute name="class">badge priority-high</xsl:attribute>
                        </xsl:when>
                        <xsl:otherwise>
                          <xsl:attribute name="class">badge</xsl:attribute>
                        </xsl:otherwise>
                      </xsl:choose>
                      <xsl:value-of select="sitemap:priority"/>
                    </span>
                  </td>
                  <td>
                    <span style="font-size: 11px; color: #78716c; font-family: ui-monospace, monospace;">
                      <xsl:value-of select="substring(sitemap:lastmod, 0, 11)"/>
                    </span>
                  </td>
                </tr>
              </xsl:for-each>
            </tbody>
          </table>

          <div class="footer">
            &copy; Anton Merkurov · merkurov.love
          </div>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>