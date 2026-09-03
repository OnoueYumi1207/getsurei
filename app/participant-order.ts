type Group = { id: number; name: string };
type Participant = { id: number; groupId: number; name: string };

const ROSTER_ORDER: Record<string, string[]> = {
  "お台場": ["芦田裕善", "三國友美", "武藤友紀", "渡部佐知子", "四方聖子", "小川芽依"],
  "羽田": ["友田真吾", "友田由美", "時任竹是", "時任正美", "松山祐子", "根本真由美", "樫村百合子", "千代田隆", "中山須美子"],
  "かながわ": ["大西　実", "道城一隆", "柳澤政智", "風間千穂", "風間謙一", "小野博子", "大中俊一"],
  "富士山": ["石原　因", "三上ますみ", "松田静香", "井上豊子"],
  "埼玉": ["小川克枝", "飯山雄二", "木津邦雄", "中村勝利", "原田直子", "西野志穂", "坂尻博昭", "上原美雪", "岡野寿美子", "冨永千栄子", "相田八重子", "飯山佳子", "須黒安子", "新井康夫"],
  "千葉": ["阿部和浩", "大越隆郎", "寺本光良", "仲野建一", "池田晴子", "山本千鶴子", "加藤裕美子", "渡邊美里", "山形寿代", "後藤義子", "千本木ゆかり", "神子亜誠", "笠間　歩", "大森裕邦"],
  "山梨": ["細田倫宏", "尾ノ上裕美", "米倉三穂", "宮川康子", "宮川エブリン"],
};

const DEFAULT_ABSENT_MEMBERS = [
  { groupName: "かながわ", name: "大西　実" },
  { groupName: "富士山", name: "松田静香" },
] as const;

function normalizedName(name: string) {
  return name.replace(/[\s\u3000]/g, "");
}

const rosterRanks = new Map(
  Object.entries(ROSTER_ORDER).map(([groupName, names]) => [
    groupName,
    new Map(names.map((name, index) => [normalizedName(name), index])),
  ]),
);

export function sortParticipantsByRoster<T extends Participant>(
  groups: Group[],
  participants: T[],
) {
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  return [...participants].sort((a, b) => {
    if (a.groupId !== b.groupId) return a.groupId - b.groupId;
    const ranks = rosterRanks.get(groupNames.get(a.groupId) ?? "");
    const aRank = ranks?.get(normalizedName(a.name)) ?? Number.MAX_SAFE_INTEGER;
    const bRank = ranks?.get(normalizedName(b.name)) ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return a.id - b.id;
  });
}

export function defaultAbsentMembers() {
  return DEFAULT_ABSENT_MEMBERS;
}
