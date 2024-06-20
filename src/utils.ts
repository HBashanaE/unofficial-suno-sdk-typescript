// function to randomly select an element from a list
export function randomChoice<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

// get random number between given range
export function getRandomNumber(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

// wait given amount of miliseconds
export async function waitMiliSeconds(miliSeconds: number) {
  return await new Promise((resolve) => setTimeout(resolve, miliSeconds));
}
