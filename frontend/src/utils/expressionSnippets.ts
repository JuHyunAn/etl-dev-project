export interface Snippet {
  label: string;
  template: string; // $col → 삽입 시 sourceColumn으로 치환
  desc: string;
}

export const SNIPPETS: Record<string, Snippet[]> = {
  String: [
    { label: 'TRIM',              template: 'TRIM($col)',                             desc: '앞뒤 공백 제거' },
    { label: 'UPPER',             template: 'UPPER($col)',                            desc: '대문자 변환' },
    { label: 'LOWER',             template: 'LOWER($col)',                            desc: '소문자 변환' },
    { label: 'TRIM + UPPER',      template: 'UPPER(TRIM($col))',                      desc: '공백 제거 + 대문자' },
    { label: 'SUBSTR',            template: 'SUBSTR($col, 1, 10)',                    desc: '문자열 자르기' },
    { label: 'REPLACE',           template: "REPLACE($col, ' ', '')",                desc: '문자열 치환' },
    { label: 'CONCAT',            template: "CONCAT($col, '')",                      desc: '문자열 연결' },
    { label: "COALESCE → ''",     template: "COALESCE($col, '')",                    desc: 'NULL → 빈 문자열' },
    { label: "TRIM + COALESCE",   template: "COALESCE(TRIM($col), '')",              desc: '공백 제거 + NULL 대체' },
    { label: 'LENGTH',            template: 'LENGTH($col)',                           desc: '문자열 길이' },
  ],
  Number: [
    { label: 'COALESCE → 0',      template: 'COALESCE($col, 0)',                     desc: 'NULL → 0' },
    { label: 'ABS',               template: 'ABS($col)',                             desc: '절대값' },
    { label: 'ROUND(2)',          template: 'ROUND($col, 2)',                         desc: '반올림 소수 2자리' },
    { label: 'FLOOR',             template: 'FLOOR($col)',                            desc: '내림' },
    { label: 'CEIL',              template: 'CEIL($col)',                             desc: '올림' },
    { label: 'CAST INTEGER',      template: 'CAST($col AS INTEGER)',                 desc: '정수 변환' },
    { label: 'CAST DECIMAL',      template: 'CAST($col AS DECIMAL(18,4))',           desc: '소수 변환' },
    { label: 'CAST VARCHAR',      template: 'CAST($col AS VARCHAR(100))',            desc: '문자열 변환' },
  ],
  Date: [
    { label: 'CAST DATE',         template: 'CAST($col AS DATE)',                    desc: '날짜 변환' },
    { label: 'CAST TIMESTAMP',    template: 'CAST($col AS TIMESTAMP)',               desc: '타임스탬프 변환' },
    { label: 'CURRENT_DATE',      template: 'CURRENT_DATE',                          desc: '오늘 날짜' },
    { label: 'NOW()',             template: 'NOW()',                                  desc: '현재 시각' },
    { label: "COALESCE → TODAY",  template: 'COALESCE($col, CURRENT_DATE)',          desc: 'NULL → 오늘' },
    { label: "DATE_TRUNC day",    template: "DATE_TRUNC('day', $col)",               desc: '날짜 절삭(일)' },
    { label: "DATE_TRUNC month",  template: "DATE_TRUNC('month', $col)",             desc: '날짜 절삭(월)' },
    { label: "TO_CHAR",           template: "TO_CHAR($col, 'YYYY-MM-DD')",           desc: '날짜 → 문자열' },
  ],
  Null: [
    { label: 'COALESCE',          template: 'COALESCE($col, )',                      desc: 'NULL 대체' },
    { label: 'NULLIF',            template: 'NULLIF($col, )',                        desc: '값이 같으면 NULL 반환' },
    { label: 'CASE IS NULL',      template: 'CASE WHEN $col IS NULL THEN  ELSE $col END', desc: 'NULL 분기' },
    { label: 'CASE WHEN',         template: 'CASE WHEN $col =  THEN  ELSE  END',    desc: '조건 분기' },
  ],
};

export const SNIPPET_CATEGORIES = Object.keys(SNIPPETS) as (keyof typeof SNIPPETS)[];

/** $col 플레이스홀더를 sourceColumn으로 치환. sourceColumn 없으면 그대로. */
export function applySnippet(template: string, sourceColumn: string): string {
  return sourceColumn ? template.replace(/\$col/g, sourceColumn) : template;
}
