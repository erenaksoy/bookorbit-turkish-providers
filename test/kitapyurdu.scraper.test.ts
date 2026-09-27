import {
  buildKitapyurduSearchUrl,
  buildKitapyurduSearchQueries,
  extractKitapyurduId,
  extractKitapyurduSearchResults,
  parseKitapyurduBookPage,
} from '../src/kitapyurdu/scraper';

const BOOK_HTML = `
  <h1 class="pr_header__heading">Sefiller</h1>
  <div class="pr_producers__manufacturer"><div class="pr_producers__item">Victor Hugo,</div></div>
  <div class="pr_producers__publisher">İSKELE YAYINCILIK</div>
  <div class="pr_images"><a href="https://img.kitapyurdu.com/v1/getImage/fn:11628230/wi:800/wh:db49c74b0"></a></div>
  <div id="description_text"><span class="info__text">Romantik dönemin <b>en önemli</b> eseri.</span></div>
  <table class="attributes">
    <tr><td>Yayın Tarihi:</td><td>01.11.2022</td>
    <tr><td>Dil:</td><td>Türkçe</td>
    <tr><td>Sayfa Sayısı:</td><td>400</td>
    <tr><td>ISBN:</td><td>9789759099077</td>
  </table>
  <ul class="rel-cats__list">
    <li><a class="rel-cats__link"><span>Kitap</span><span>Edebiyat</span></a></li>
    <li><a class="rel-cats__link"><span>Orijinal Dil</span><span>Fransızca</span></a></li>
  </ul>
`;

describe('kitapyurdu scraper', () => {
  it('parses a product page including its malformed attributes table', () => {
    expect(parseKitapyurduBookPage(BOOK_HTML, '72590')).toEqual({
      providerId: '72590',
      title: 'Sefiller',
      authors: ['Victor Hugo'],
      publisher: 'İskele Yayıncılık',
      description: 'Romantik dönemin en önemli eseri.',
      publishedDate: '2022-11-01',
      language: 'tr',
      pageCount: 400,
      isbn13: '9789759099077',
      genres: ['Edebiyat'],
      coverUrl: 'https://img.kitapyurdu.com/v1/getImage/fn:11628230/wi:800/wh:db49c74b0',
    });
  });

  it('falls back to JSON-LD when the page markup is missing', () => {
    const html = `<script type="application/ld+json">{"@type":"Book","name":"Kitap","author":{"name":"Yazar"},"isbn":"9789759099077","numberOfPages":"12"}</script>`;
    expect(parseKitapyurduBookPage(html, '1')).toMatchObject({ title: 'Kitap', authors: ['Yazar'], isbn13: '9789759099077', pageCount: 12 });
  });

  it('never builds a watermarked cover url without the hash', () => {
    const html = '<h1 class="pr_header__heading">A</h1><div class="pr_images"><img src="https://img.kitapyurdu.com/v1/getImage/fn:1/wi:200"></div>';
    expect(parseKitapyurduBookPage(html, '1').coverUrl).toBeUndefined();
  });

  it('ignores non-book search results', () => {
    const html = `
      <div class="ky-product" data-product-id="1"><a class="ky-product-cover" href="/kitap/x/1.html"></a></div>
      <div class="ky-product" data-product-id="2"><a class="ky-product-cover" href="/kirtasiye/x/2.html"></a></div>
      <div class="ky-product" data-product-id="3"><a class="ky-product-cover" href="/kitap/x/3.html"></a></div>`;
    expect(extractKitapyurduSearchResults(html, 10)).toEqual(['1', '3']);
  });

  it('picks the smallest site page size that covers the limit', () => {
    expect(buildKitapyurduSearchUrl('a b', 5)).toContain('limit=20');
    expect(buildKitapyurduSearchUrl('a b', 25)).toContain('limit=25');
    expect(buildKitapyurduSearchUrl('a b', 99)).toContain('limit=50');
  });

  it('extracts ids from urls and bare ids', () => {
    expect(extractKitapyurduId('https://www.kitapyurdu.com/kitap/sefiller/72590.html')).toBe('72590');
    expect(extractKitapyurduId('72590')).toBe('72590');
    expect(extractKitapyurduId('abc')).toBeUndefined();
  });

  it('never puts a dash or an ISBN into a query', () => {
    expect(buildKitapyurduSearchQueries('Ayşegül Devecioğlu - Kuma Daireler Çizen', 'Ayşegül Devecioğlu')).toEqual([
      'Kuma Daireler Çizen',
      'Kuma Daireler Çizen Ayşegül Devecioğlu',
      'Ayşegül Devecioğlu',
    ]);
    expect(buildKitapyurduSearchQueries('Ayşegül Devecioğlu - Kuma Daireler Çizen', undefined)).toEqual([
      'Kuma Daireler Çizen',
      'Ayşegül Devecioğlu',
      'Ayşegül Devecioğlu Kuma Daireler Çizen',
    ]);
    expect(buildKitapyurduSearchQueries('Sefiller', 'Victor Hugo')).toEqual(['Sefiller', 'Sefiller Victor Hugo', 'Victor Hugo']);
    expect(buildKitapyurduSearchQueries(undefined, 'Victor Hugo')).toEqual(['Victor Hugo']);
    expect(buildKitapyurduSearchQueries('  ', undefined)).toEqual([]);
  });
});
