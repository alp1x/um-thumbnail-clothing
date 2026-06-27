/// <reference types="@citizenfx/server" />
/// <reference types="image-js" />

const imagejs = require('image-js');
const fs = require('fs');
const https = require('https');
const path = require('path');

const resName = GetCurrentResourceName();
const config = JSON.parse(LoadResourceFile(GetCurrentResourceName(), "config.json"));

// FXServer's Node permission model only allows fs writes inside our own resource folder
const mainSavePath = `resources/${resName}/images`;

// Set this in server.cfg:  set fivemanage_api_key "your-key-here"
const FIVEMANAGE_API_KEY = GetConvar('fivemanage_api_key', '');

if (config.remoteUploadFiveManage && !FIVEMANAGE_API_KEY) {
	console.error('[fivem-greenscreener] remoteUploadFiveManage is enabled but convar "fivemanage_api_key" is not set.');
}

// Maps "type/name" -> uploaded FiveManage URL, persisted so the random CDN links stay usable
const linksFilePath = `${mainSavePath}/links.json`;
const uploadedLinks = fs.existsSync(linksFilePath)
	? JSON.parse(fs.readFileSync(linksFilePath, 'utf8'))
	: {};

function saveLink(key, url) {
	uploadedLinks[key] = url;
	fs.writeFileSync(linksFilePath, JSON.stringify(uploadedLinks, null, 2));
}

function buildMultipartBody(boundary, fileBuffer, fileName, fields) {
	const parts = [];
	for (const [name, value] of Object.entries(fields)) {
		parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
	}
	parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`));
	parts.push(fileBuffer);
	parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
	return Buffer.concat(parts);
}

function uploadToFiveManage(filePath, key, type) {
	const fileBuffer = fs.readFileSync(filePath);
	const fileName = path.basename(filePath);
	const boundary = '----FormBoundary' + Date.now().toString(16);

	const body = buildMultipartBody(boundary, fileBuffer, fileName, {
		path: type,
		filename: fileName,
		metadata: JSON.stringify({ name: key }),
	});

	const req = https.request({
		hostname: 'api.fivemanage.com',
		path: '/api/v3/file',
		method: 'POST',
		headers: {
			'Authorization': FIVEMANAGE_API_KEY,
			'Content-Type': `multipart/form-data; boundary=${boundary}`,
			'Content-Length': body.length
		}
	}, (res) => {
		let data = '';
		res.on('data', (chunk) => data += chunk);
		res.on('end', () => {
			try {
				const response = JSON.parse(data);
				const url = response.data?.url || response.url;
				if (!url) throw new Error('No url in response');
				saveLink(`${type}/${key}`, url);
				if (config.debug) console.log(`DEBUG: Uploaded ${key} -> ${url}`);
				fs.unlinkSync(filePath);
			} catch (e) {
				console.error(`FiveManage upload error, keeping local file: ${data}`);
			}
		});
	});

	req.on('error', (err) => {
		console.error(`FiveManage upload failed: ${err.message}`);
	});

	req.write(body);
	req.end();
}

try {
	if (!fs.existsSync(mainSavePath)) {
		fs.mkdirSync(mainSavePath);
	}

	onNet('takeScreenshot', async (filename, type) => {
		const savePath = `${mainSavePath}/${type}`;
		if (!fs.existsSync(savePath)) {
			fs.mkdirSync(savePath);
		}

		const fullFilePath = `${savePath}/${filename}.png`;

		// overwriteExistingImages: if false, existing image files are skipped instead of overwritten
		if (!config.overwriteExistingImages && fs.existsSync(fullFilePath)) {
			if (config.debug) {
				console.log(`DEBUG: Skipping existing file: ${filename}.png (overwriteExistingImages = false)`);
			}
			return;
		}

		if (config.debug) {
			console.log(`DEBUG: Processing screenshot: ${filename}.png`);
		}

		exports['screencapture'].serverCapture(
			source,
			{
				encoding: 'png',
				maxWidth: config.screenshotSettings.maxWidth,
				maxHeight: config.screenshotSettings.maxHeight,
			},
			async (data) => {
				const image = (await imagejs.Image.load(data)).rgba8();

				for (let x = 0; x < image.width; x++) {
					for (let y = 0; y < image.height; y++) {
						const [r, g, b] = image.getPixelXY(x, y);

						if (g > 90 && g > r * 1.2 && g > b * 1.2) {
							image.setPixelXY(x, y, [0, 0, 0, 0]);
						} else if (g > r && g > b) {
							const limit = Math.max(r, b);
							image.setPixelXY(x, y, [r, limit, b, 255]);
						}
					}
				}

				let result = image;
				try {
					result = image.cropAlpha({ threshold: 1 });
				} catch (cropError) {
					if (config.debug) console.log(`DEBUG: Nothing to crop for ${filename}`);
				}

				await result.save(fullFilePath);

				if (config.debug) {
					console.log(`DEBUG: Saved ${filename}.png`);
				}

				// remoteUploadFiveManage: if true, processed images are also uploaded to FiveManage (set API key above)
				if (config.remoteUploadFiveManage) {
					uploadToFiveManage(fullFilePath, filename, type);
				}
			}
		);
	});
} catch (error) {
	console.error(error.message);
}
