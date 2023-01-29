const YEAR = new Date().getFullYear()

export default {
  darkMode: true,
  footer: (
    <small style={{ display: 'block', marginTop: '8rem' }}>
      <time>{YEAR}</time> © Jackey.dou
      <a href="/feed.xml">RSS</a>
      <section id="comments">
        <script src="https://utteranc.es/client.js"
          repo="jackeydou/portfolio"
          issue-term="pathname"
          theme="github-dark"
          crossOrigin="anonymous"
          path="posts"
          async>
        </script>
      </section>
      <style jsx>{`
        a {
          float: right;
        }
        @media screen and (max-width: 480px) {
          article {
            padding-top: 2rem;
            padding-bottom: 4rem;
          }
        }
      `}</style>
    </small>
  )
}
