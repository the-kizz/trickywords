import type { Word, WordSet, Classification } from './types'

function w(
  text: string, graphemes: string[], phonemes: string[],
  trickyIndices: number[], classification: Classification, sentences: string[],
): Word {
  return {
    id: text.toLowerCase(), text, graphemes, phonemes,
    trickyIndices, classification, sentences, audioId: text.toLowerCase(),
  }
}

export const DEFAULT_SETS: WordSet[] = [
  { id: 1, name: 'Set 1', words: [
    w('I', ['I'], ['/ai/'], [0], 'heart', ['I can run.']),
    w('the', ['th','e'], ['/th/','/uh/'], [1], 'heart', ['The cat sat.']),
    w('my', ['m','y'], ['/m/','/ai/'], [1], 'heart', ['My dog is big.']),
    w('a', ['a'], ['/uh/'], [0], 'heart', ['A pig ran.']),
    w('is', ['i','s'], ['/i/','/z/'], [1], 'heart', ['It is hot.']),
  ]},
  { id: 2, name: 'Set 2', words: [
    w('was', ['w','a','s'], ['/w/','/o/','/z/'], [1,2], 'heart', ['It was fun.']),
    w('you', ['y','ou'], ['/y/','/oo/'], [1], 'heart', ['Can you run?']),
    w('to', ['t','o'], ['/t/','/oo/'], [1], 'heart', ['Run to me.']),
    w('they', ['th','ey'], ['/th/','/ay/'], [1], 'heart', ['They can hop.']),
    w('that', ['th','a','t'], ['/th/','/a/','/t/'], [], 'decodable', ['That is my hat.']),
  ]},
  { id: 3, name: 'Set 3', words: [
    w('said', ['s','ai','d'], ['/s/','/e/','/d/'], [1], 'heart', ['Mum said yes.']),
    w('are', ['a','re'], ['/ar/','/_/'], [0,1], 'heart', ['We are here.']),
    w('he', ['h','e'], ['/h/','/ee/'], [1], 'heart', ['He can jump.']),
    w('she', ['sh','e'], ['/sh/','/ee/'], [1], 'heart', ['She has a cat.']),
    w('me', ['m','e'], ['/m/','/ee/'], [1], 'heart', ['Look at me.']),
    w('be', ['b','e'], ['/b/','/ee/'], [1], 'heart', ['I will be good.']),
    w('we', ['w','e'], ['/w/','/ee/'], [1], 'heart', ['We can play.']),
  ]},
  { id: 4, name: 'Set 4', words: [
    w('were', ['w','e','re'], ['/w/','/er/','/_/'], [1,2], 'heart', ['We were sad.']),
    w('has', ['h','a','s'], ['/h/','/a/','/z/'], [2], 'heart', ['He has a dog.']),
    w('look', ['l','oo','k'], ['/l/','/oo/','/k/'], [], 'decodable', ['Look at the sun.']),
    w('one', ['o','n','e'], ['/w/','/u/','/n/'], [0,2], 'heart', ['I have one hat.']),
  ]},
  { id: 5, name: 'Set 5', words: [
    w('his', ['h','i','s'], ['/h/','/i/','/z/'], [2], 'heart', ['His cat is fat.']),
    w('her', ['h','er'], ['/h/','/er/'], [], 'decodable', ['Her bag is red.']),
    w('them', ['th','e','m'], ['/th/','/e/','/m/'], [], 'decodable', ['I can see them.']),
    w('there', ['th','ere'], ['/th/','/air/'], [1], 'heart', ['Sit over there.']),
  ]},
  { id: 6, name: 'Set 6', words: [
    w('have', ['h','a','v','e'], ['/h/','/a/','/v/','/_/'], [3], 'heart', ['I have a pet.']),
    w('of', ['o','f'], ['/o/','/v/'], [1], 'heart', ['A cup of tea.']),
    w('here', ['h','ere'], ['/h/','/eer/'], [1], 'heart', ['Come here.']),
    w('with', ['w','i','th'], ['/w/','/i/','/th/'], [], 'decodable', ['Play with me.']),
  ]},
  { id: 7, name: 'Set 7', words: [
    w('all', ['a','ll'], ['/or/','/l/'], [], 'family', ['We all ran.']),
    w('call', ['c','a','ll'], ['/k/','/or/','/l/'], [], 'family', ['Call the dog.']),
    w('ball', ['b','a','ll'], ['/b/','/or/','/l/'], [], 'family', ['The ball is red.']),
    w('tall', ['t','a','ll'], ['/t/','/or/','/l/'], [], 'family', ['He is tall.']),
    w('little', ['l','i','tt','le'], ['/l/','/i/','/t/','/l/'], [3], 'heart', ['A little cat.']),
  ]},
  { id: 8, name: 'Set 8', words: [
    w('go', ['g','o'], ['/g/','/oa/'], [], 'decodable', ['Go to bed.']),
    w('so', ['s','o'], ['/s/','/oa/'], [], 'decodable', ['I am so hot.']),
    w('no', ['n','o'], ['/n/','/oa/'], [], 'decodable', ['No, not that one.']),
    w('this', ['th','i','s'], ['/th/','/i/','/s/'], [], 'decodable', ['This is fun.']),
    w('then', ['th','e','n'], ['/th/','/e/','/n/'], [], 'decodable', ['Then we ran.']),
  ]},
  { id: 9, name: 'Set 9', words: [
    w('put', ['p','u','t'], ['/p/','/oo/','/t/'], [1], 'heart', ['Put it down.']),
    w('as', ['a','s'], ['/a/','/z/'], [1], 'heart', ['As big as me.']),
    w('do', ['d','o'], ['/d/','/oo/'], [1], 'heart', ['Do it now.']),
    w('like', ['l','i','k','e'], ['/l/','/ie/','/k/','/_/'], [], 'decodable', ['I like cats.']),
    w('very', ['v','e','r','y'], ['/v/','/e/','/r/','/ee/'], [3], 'heart', ['It is very big.']),
  ]},
  { id: 10, name: 'Set 10', words: [
    w('what', ['wh','a','t'], ['/w/','/o/','/t/'], [1], 'heart', ['What is that?']),
    w('where', ['wh','ere'], ['/w/','/air/'], [1], 'heart', ['Where is my hat?']),
    w('want', ['w','a','n','t'], ['/w/','/o/','/n/','/t/'], [1], 'heart', ['I want a dog.']),
    w('some', ['s','o','m','e'], ['/s/','/u/','/m/','/_/'], [1,3], 'heart', ['I want some.']),
    w('come', ['c','o','m','e'], ['/k/','/u/','/m/','/_/'], [1,3], 'heart', ['Come and play.']),
  ]},
  { id: 11, name: 'Set 11', words: [
    w('down', ['d','ow','n'], ['/d/','/ow/','/n/'], [], 'decodable', ['Sit down here.']),
    w('out', ['ou','t'], ['/ow/','/t/'], [], 'decodable', ['Get out of bed.']),
    w('for', ['f','or'], ['/f/','/or/'], [], 'decodable', ['This is for you.']),
    w('or', ['or'], ['/or/'], [], 'decodable', ['Red or blue?']),
  ]},
  { id: 12, name: 'Set 12', words: [
    w('should', ['sh','ould'], ['/sh/','/ood/'], [1], 'heart', ['You should sit.']),
    w('would', ['w','ould'], ['/w/','/ood/'], [1], 'heart', ['Would you help?']),
    w('could', ['c','ould'], ['/k/','/ood/'], [1], 'heart', ['I could run fast.']),
  ]},
]
