import { pushState } from '$app/navigation';
import { page } from '$app/stores';
import he from 'he';
import humanNumber from 'human-number';
import type Peer from 'peerjs';
import { get } from 'svelte/store';
import type { Image } from './api/model';
import { instanceStore, interfaceForceCase } from './store';


export type TitleCase = 'uppercase' | 'lowercase' | 'sentence case' | 'title case' | null;
export const titleCases: TitleCase[] = [
	'lowercase',
	'uppercase',
	'title case',
	'sentence case'
];

export function letterCase(text: string, caseTypeOverwrite?: TitleCase): string {
	const casing = caseTypeOverwrite ? caseTypeOverwrite : get(interfaceForceCase);
	if (!casing) return text;

	switch (casing) {
		case 'lowercase':
			return text.toLowerCase();
		case 'uppercase':
			return text.toUpperCase();
		case 'sentence case':
			return sentenceCase(text);
		default:
			return titleCase(text);
	}
}

export function sentenceCase(text: string): string {
	let sentences: string[] = text.match(/[^.!?]*[.!?]*/g) || [];

	let casedSentences: string[] = sentences.map(sentence => {
		sentence = sentence.trim();
		if (sentence.length === 0) return '';
		return sentence.charAt(0).toUpperCase() + sentence.slice(1).toLowerCase();
	});

	return casedSentences.join(' ');
}

export function titleCase(text: string): string {
	if (!text) return '';

	let words: string[] = text.split(/(\s+)/).filter(word => word.trim().length > 0);

	let titleCasedWords: string[] = words.map(word => {
		if (word.length === 0) return '';

		const firstChar = word.charAt(0);
		const restOfWord = word.slice(1).toLowerCase();

		// Capitalize if the first character is a letter
		if (/[a-zA-Z]/.test(firstChar)) {
			return firstChar.toUpperCase() + restOfWord;
		}

		return word;
	});

	return titleCasedWords.join(' ');
}


export function truncate(value: string, maxLength: number = 50): string {
	return value.length > maxLength ? `${value.substring(0, maxLength)}...` : value;
}

export function numberWithCommas(number: number) {
	if (typeof number === 'undefined') return;
	return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function cleanNumber(number: number): string {
	return humanNumber(number, (number: number) =>
		Number.parseFloat(number.toString()).toFixed(1)
	).replace('.0', '');
}

export function videoLength(lengthSeconds: number): string {
	const hours = Math.floor(lengthSeconds / 3600);
	let minutes: number | string = Math.floor((lengthSeconds % 3600) / 60);
	let seconds: number | string = Math.round(lengthSeconds % 60);

	if (minutes < 10) {
		minutes = `0${minutes}`;
	}

	if (seconds < 10) {
		seconds = `0${seconds}`;
	}

	if (hours !== 0) {
		return `${hours}:${minutes}:${seconds}`;
	} else {
		return `${minutes}:${seconds}`;
	}
}

export interface PhasedDescription {
	description: string;
	timestamps: { title: string; time: number; timePretty: string; }[];
}

export function decodeHtmlCharCodes(str: string): string {
	const { decode } = he;
	return decode(str);
}

export function phaseDescription(content: string, usingYoutubeJs: boolean = false): PhasedDescription {
	const timestamps: { title: string; time: number; timePretty: string; }[] = [];
	const lines = content.split('\n');

	// Regular expressions for different timestamp formats
	const urlRegex = /<a href="([^"]+)"/;
	const timestampRegexInvidious = /<a href="([^"]+)" data-onclick="jump_to_time" data-jump-time="(\d+)">(\d+:\d+(?::\d+)?)<\/a>\s*(.+)/;
	const timestampRegexYtJs = /&(?:\S*?&)?t=(\d+)\s*s.*?<span[^>]*>([^<]*)<\/span>.*?>(.*?)<\/span>/;

	let filteredLines: string[] = [];
	lines.forEach((line) => {
		const urlMatch = urlRegex.exec(line);
		// Use appropriate regex based on the `usingYoutubeJs` flag
		const timestampMatch = (usingYoutubeJs ? timestampRegexYtJs : timestampRegexInvidious).exec(usingYoutubeJs ? line + '</span>' : line);

		if (urlMatch !== null && timestampMatch === null) {
			// If line contains a URL but not a timestamp, modify the URL
			const modifiedLine = line.replace(
				/<a href="([^"]+)"/,
				'<a href="$1" target="_blank" rel="noopener noreferrer" class="link"'
			);
			filteredLines.push(modifiedLine);
		} else if (timestampMatch !== null) {
			// If line contains a timestamp, extract details and push into timestamps array
			const time = usingYoutubeJs ? timestampMatch[1] : timestampMatch[2];
			const timestamp = usingYoutubeJs ? timestampMatch[2] : timestampMatch[3];
			const title = usingYoutubeJs ? timestampMatch[3] || '' : timestampMatch[4] || '';
			timestamps.push({
				time: convertToSeconds(time),
				// Remove any HTML in the timestamp title.
				title: decodeHtmlCharCodes(title.replace(/<[^>]+>/g, '').replace(/\n/g, '').trim()),
				timePretty: timestamp
			});
		} else {
			filteredLines.push(line);
		}
	});

	const filteredContent = filteredLines.join('\n');

	return { description: filteredContent, timestamps: timestamps };
}


function convertToSeconds(time: string): number {
	const parts = time.split(':').map((part) => parseInt(part));
	let seconds = 0;
	if (parts.length === 3) {
		// hh:mm:ss
		seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
	} else if (parts.length === 2) {
		// hh:ss or m:ss
		seconds = parts[0] * 60 + parts[1];
	} else if (parts.length === 1) {
		// s
		seconds = parts[0];
	}
	return seconds;
}

export function humanizeSeconds(totalSeconds: number): string {
	const secondsInMinute = 60;
	const secondsInHour = 3600;

	const hours = Math.floor(totalSeconds / secondsInHour);
	const minutes = Math.floor((totalSeconds % secondsInHour) / secondsInMinute);

	const parts: string[] = [];

	if (hours > 0) {
		parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
	}
	if (minutes > 0) {
		parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
	}

	return parts.join(', ');
}

export function proxyVideoUrl(source: string): string {
	const rawSrc = new URL(source);
	rawSrc.host = get(instanceStore).replace('http://', '').replace(
		'https://',
		''
	);

	return rawSrc.toString();
}

export function pullBitratePreference(): number {
	const vidstack = localStorage.getItem('video-player');

	if (vidstack) {
		const vidstackSettings = JSON.parse(vidstack);
		if (vidstackSettings.quality && vidstackSettings.quality.bitrate) {
			return vidstackSettings.quality.bitrate;
		}
	}

	return -1;
}

export function proxyGoogleImage(source: string): string {
	if (source.startsWith('//')) source = `https:${source}`;

	let path: string | undefined;
	try {
		path = new URL(source).pathname;
	} catch { }

	if (typeof path === 'undefined') return '';

	return `${get(instanceStore)}/ggpht${path}`;
}

export function unsafeRandomItem(array: any[]): any {
	return array[Math.floor(Math.random() * array.length)];
}

export function setWindowQueryFlag(key: string, value: string) {
	const currentPage = get(page);
	currentPage.url.searchParams.set(key, value);
	pushState(currentPage.url, currentPage.state);
}

export function removeWindowQueryFlag(key: string) {
	const currentPage = get(page);
	currentPage.url.searchParams.delete(key);
	pushState(currentPage.url, currentPage.state);
}

let PeerInstance: typeof Peer;
export async function peerJs(peerId: string): Promise<Peer> {
	// https://github.com/peers/peerjs/issues/819
	if (typeof PeerInstance === 'undefined') {
		PeerInstance = (await import('peerjs')).Peer;
	}
	return new PeerInstance(
		peerId,
		{
			host: import.meta.env.VITE_DEFAULT_PEERJS_HOST || '0.peerjs.com',
			path: import.meta.env.VITE_DEFAULT_PEERJS_PATH || '/',
			port: import.meta.env.VITE_DEFAULT_PEERJS_PORT || 443
		}
	);
}

export function getBestThumbnail(
	images: Image[] | null,
	maxWidthDimension: number = 480,
	maxHeightDimension = 360
): string {
	if (images && images.length > 0) {
		const imagesFiltered = images.filter(
			(image) => image.width < maxWidthDimension && image.height < maxHeightDimension
		);

		if (imagesFiltered.length === 0) {
			return images[0].url;
		}

		imagesFiltered.sort((a, b) => {
			return b.width * b.height - a.width * a.height;
		});

		return imagesFiltered[0].url;
	} else {
		return '';
	}
}

export function ensureNoTrailingSlash(url: any): string {
	if (typeof url !== 'string') return '';

	return url.endsWith('/') ? url.slice(0, -1) : url;
}
