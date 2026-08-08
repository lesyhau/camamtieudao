// What the polish model is asked, and how its answer is read back.
//
// It is shown WORDS ONLY, and it answers in words only. No notes reach it and none come back,
// so a model mistake can cost a line break or a section title but never a pitch. Everything
// musical - which notes belong to which syllable, which repeats collapse, which verse wins -
// is settled in compose.ts before this file is involved.
//
// The first version of this prompt handed the model the notes as well and asked for all four
// jobs at once. Measured on the reference song, gemini-3.5-flash-lite kept 394 of 419 notes,
// produced one phrase per printed line instead of per sentence, and echoed the two-verse
// notation into the words as `个/们 世/命 界/运`. Asking for less got all of it.

export const SYSTEM = `Bạn giúp biên tập lời một bài hát Hoa ngữ để in kèm bản cảm âm cho sáo trúc.

Đầu vào là toàn bộ lời bài hát, các tiếng cách nhau bằng dấu cách, theo đúng thứ tự hát.

Việc của bạn:
1. Ngắt lời thành từng CÂU HÁT. Mỗi câu một dòng. Dựa vào dấu câu, ngữ nghĩa và nhịp thở tự
   nhiên của câu hát.
2. Gom các câu thành ĐOẠN và đặt tên đoạn bằng tiếng Việt: Lời 1, Lời 2, Điệp khúc, Kết...
   Câu lặp lại gần như nguyên văn ở nhiều chỗ thường là điệp khúc.

Quy tắc bắt buộc:
- CHÉP LẠI ĐÚNG từng tiếng như đầu vào, đúng thứ tự, không thiếu một tiếng nào, không thêm
  tiếng nào, không sửa chữ. Ghép tất cả các dòng kết quả lại phải ra đúng chuỗi đầu vào.
- MỖI TIẾNG ĐỨNG RIÊNG, cách nhau đúng một dấu cách. Không nối hai tiếng bằng dấu gạch nối,
  không dùng gạch nối ở cuối dòng, không thêm dấu gạch nào.
- Giữ nguyên dấu câu đã có, dính liền với tiếng đứng trước nó. Không thêm dấu câu mới.
- Không dịch, không phiên âm, không chú thích, không viết gì ngoài định dạng bên dưới.
- Chỉ được thêm chỗ xuống dòng và tên đoạn.

Định dạng trả lời, không thêm gì khác:

## Tên đoạn
tiếng tiếng tiếng
tiếng tiếng tiếng

## Tên đoạn tiếp theo
tiếng tiếng tiếng`;

export interface RawSection { title: string; lines: string[] }

/**
 * Reads `## title` + word lines back.
 *
 * Forgiving by design: the alignment in compose.ts re-matches every syllable against the song
 * anyway, so a stray blank line or a bit of preamble costs nothing. Anything before the first
 * `##` becomes an untitled section rather than being thrown away.
 */
export function parseSections(text: string): RawSection[] {
  const out: RawSection[] = [];
  let current: RawSection | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const head = /^#{1,6}\s*(.+?)\s*$/.exec(line);
    if (head) {
      current = { title: head[1], lines: [] };
      out.push(current);
      continue;
    }
    // A fenced block or a stray bullet is chrome, not lyric.
    if (/^(```|\* |- |\d+\. )/.test(line)) continue;
    if (!current) { current = { title: "", lines: [] }; out.push(current); }
    current.lines.push(line);
  }
  return out.filter((s) => s.lines.length);
}
