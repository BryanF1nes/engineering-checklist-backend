export const AVATAR_COLORS = [
    '#4A80C5',
    '#8967B3',
    '#579B78',
    '#D58A4A',
    '#C76D83',
    '#429C9A',
    '#6976C5',
    '#D87562',
];

export function getRandomAvatarColor() {
    const index = Math.floor(Math.random() * AVATAR_COLORS.length);

    return AVATAR_COLORS[index];
}
