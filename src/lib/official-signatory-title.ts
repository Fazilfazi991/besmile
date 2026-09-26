export function officialSignatoryTitle(title: string, isDirectorSignatory: boolean) {
  return isDirectorSignatory && title.trim().toLowerCase() === 'director' ? 'Managing Director' : title;
}
