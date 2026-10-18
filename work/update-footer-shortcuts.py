from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
import argparse
import json
import subprocess
from urllib.parse import urlsplit

ROOT = Path('/Users/paulista/Documents/Codex/2026-06-05/new-chat')
BASELINE = 'b9b67bcd7962c18ba678437c3e0fe0c48f118088'
URL = 'https://paul-reading-room.politeelm64.chatgpt.site/#books'
LINK = f'<a href="{URL}" target="_blank" rel="noopener noreferrer">폴의 독서실</a>'
ART_URL = 'https://haru-art-journal.politeelm64.chatgpt.site'
ART_LINK = f'<a href="{ART_URL}" target="_blank" rel="noopener noreferrer">Paul Artwork</a>'
NEW_FOOTER = f'<footer class="footer" data-reading-room-footer><nav class="footer-links" aria-label="하단 링크">{LINK}{ART_LINK}</nav></footer>'


@dataclass
class Span:
    tag: str
    start: int
    opening_end: int
    closing_start: int
    end: int
    attrs: dict


class Spans(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.source = source
        self.lines = [0]
        for line in source.splitlines(keepends=True):
            self.lines.append(self.lines[-1] + len(line))
        self.stacks = {tag: [] for tag in ('footer', 'nav', 'a')}
        self.spans = []
        self.feed(source)

    def source_offset(self):
        line, column = self.getpos()
        return self.lines[line - 1] + column

    def handle_starttag(self, tag, attrs):
        if tag in self.stacks:
            start = self.source_offset()
            self.stacks[tag].append((start, start + len(self.get_starttag_text()), dict(attrs)))

    def handle_endtag(self, tag):
        if tag in self.stacks and self.stacks[tag]:
            start, opening_end, attrs = self.stacks[tag].pop()
            closing = self.source_offset()
            end = self.source.index('>', closing) + 1
            self.spans.append(Span(tag, start, opening_end, closing, end, attrs))

    def tagged(self, tag):
        return sorted((span for span in self.spans if span.tag == tag), key=lambda span: span.start)


def is_cadenza(anchor):
    return urlsplit(anchor.attrs.get('href', '')).hostname == 'the-cadenza-seoul.paulist03.chatgpt.site'


def replace_ranges(source, edits):
    for start, end, value in sorted(edits, reverse=True):
        source = source[:start] + value + source[end:]
    return source


def update_footer(source):
    parsed = Spans(source)
    anchors = parsed.tagged('a')
    old = [anchor for anchor in anchors if is_cadenza(anchor)]
    room = [anchor for anchor in anchors if anchor.attrs.get('href') == URL]
    assert len(room) <= 1
    edits = []
    for index, anchor in enumerate(old):
        edits.append((anchor.start, anchor.end, LINK if index == 0 and not room else ''))
    if not old and not room:
        navs = [nav for nav in parsed.tagged('nav') if 'footer-links' in nav.attrs.get('class', '').split()]
        if navs:
            nav = navs[0]
            contacts = [anchor for anchor in anchors if nav.start < anchor.start < nav.end
                        and anchor.attrs.get('href', '').startswith('mailto:')]
            multiline = '\n' in source[nav.opening_end:nav.closing_start]
            if contacts:
                contact = contacts[0]
                indentation = source[source.rfind('\n', 0, contact.start) + 1:contact.start]
                separator = '\n' + indentation if multiline and not indentation.strip() else ''
                edits.append((contact.start, contact.start, LINK + separator))
            else:
                position = nav.closing_start
                while position > nav.opening_end and source[position - 1].isspace():
                    position -= 1
                separator = '\n   ' if multiline else ''
                edits.append((position, position, separator + LINK))
        else:
            footer = parsed.tagged('footer')[0]
            nav = f'<nav class="footer-links" aria-label="하단 링크">{LINK}</nav>'
            edits.append((footer.closing_start, footer.closing_start, nav))
    return replace_ranges(source, edits)


def update_page(source):
    footers = Spans(source).tagged('footer')
    assert len(footers) <= 1
    if not footers:
        closing = source.rfind('</body>')
        assert closing >= 0
        return source[:closing] + NEW_FOOTER + source[closing:]
    footer = footers[0]
    updated = update_footer(source[footer.start:footer.end])
    parsed = Spans(updated)
    if not any(anchor.attrs.get('href') == ART_URL for anchor in parsed.tagged('a')):
        room = next(anchor for anchor in parsed.tagged('a') if anchor.attrs.get('href') == URL)
        updated = updated[:room.end] + ART_LINK + updated[room.end:]
    return source[:footer.start] + updated + source[footer.end:]


def without_footers(source):
    return replace_ranges(source, [(footer.start, footer.end, '') for footer in Spans(source).tagged('footer')])


def verify(file, source):
    parsed = Spans(source)
    footer = parsed.tagged('footer')
    assert len(footer) == 1, file
    links = [anchor for anchor in parsed.tagged('a') if anchor.attrs.get('href') == URL]
    assert len(links) == 1 and footer[0].start < links[0].start < footer[0].end, file
    assert links[0].attrs.get('target') == '_blank', file
    assert {'noopener', 'noreferrer'} <= set(links[0].attrs.get('rel', '').split()), file
    art = [anchor for anchor in parsed.tagged('a') if anchor.attrs.get('href') == ART_URL]
    assert len(art) == 1 and footer[0].start < art[0].start < footer[0].end, file
    assert art[0].attrs.get('target') == '_blank', file
    assert {'noopener', 'noreferrer'} <= set(art[0].attrs.get('rel', '').split()), file
    assert not any(is_cadenza(anchor) for anchor in parsed.tagged('a')), file
    assert update_page(source) == source, file
    original = subprocess.check_output(['git', 'show', f'{BASELINE}:{file}'], text=True)
    assert without_footers(source) == without_footers(original), f'Content changed outside footer: {file}'
    expected = [anchor.attrs for anchor in Spans(original).tagged('a') if not is_cadenza(anchor)]
    actual = [anchor.attrs for anchor in parsed.tagged('a') if anchor.attrs.get('href') not in (URL, ART_URL)]
    assert actual == expected, f'Existing links changed: {file}'


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    assert Path.cwd().resolve() == ROOT
    files = sorted([*Path('.').glob('*.html'), *Path('posts').glob('*.html')])
    assert len(files) == 905
    outputs = [(file, file.read_text(), update_page(file.read_text())) for file in files]
    changed = 0
    for file, original, updated in outputs:
        if args.verify:
            verify(file, original)
        elif original != updated:
            file.write_text(updated)
            changed += 1
    print(json.dumps({'pages': len(files), 'changed': changed, 'verified': args.verify}, ensure_ascii=False))
