/// <reference types="@citizenfx/client" />

const config = JSON.parse(LoadResourceFile(GetCurrentResourceName(), 'config.json'));

const Delay = (ms) => new Promise((res) => setTimeout(res, ms));

let cam;
let camInfo;
let ped;
let interval;
let hideHead = false;
const playerId = PlayerId();

// Head-bone slots: hiding the head would also hide the item itself, so we keep the head for these
function isHeadBoneSlot(type, component) {
	return (type === 'CLOTHING' && component === 1) || (type === 'PROPS' && (component === 0 || component === 1 || component === 2));
}

async function takeScreenshotForComponent(pedType, type, component, drawable, texture, cameraSettings) {
	const cameraInfo = cameraSettings ? cameraSettings : config.cameraSettings[type][component];

	hideHead = !isHeadBoneSlot(type, component);

	setWeatherTime();

	await Delay(500);

	if (!camInfo || camInfo.zPos !== cameraInfo.zPos || camInfo.fov !== cameraInfo.fov) {
		camInfo = cameraInfo;

		if (cam) {
			DestroyAllCams(true);
			DestroyCam(cam, true);
			cam = null;
		}

		SetEntityRotation(ped, config.greenScreenRotation.x, config.greenScreenRotation.y, config.greenScreenRotation.z, 0, false);
		SetEntityCoordsNoOffset(ped, config.greenScreenPosition.x, config.greenScreenPosition.y, config.greenScreenPosition.z, false, false, false);

		await Delay(50);

		const [playerX, playerY, playerZ] = GetEntityCoords(ped);
		const [fwdX, fwdY, fwdZ] = GetEntityForwardVector(ped);

		const fwdPos = {
			x: playerX + fwdX * 1.2,
			y: playerY + fwdY * 1.2,
			z: playerZ + fwdZ + camInfo.zPos,
		};

		cam = CreateCamWithParams('DEFAULT_SCRIPTED_CAMERA', fwdPos.x, fwdPos.y, fwdPos.z, 0, 0, 0, camInfo.fov, true, 0);

		PointCamAtCoord(cam, playerX, playerY, playerZ + camInfo.zPos);
		SetCamActive(cam, true);
		RenderScriptCams(true, false, 0, true, false, 0);
	}

	await Delay(50);

	// Re-anchor the ped to the greenscreen center every shot so it never drifts out of the camera frame
	SetEntityCoordsNoOffset(ped, config.greenScreenPosition.x, config.greenScreenPosition.y, config.greenScreenPosition.z, false, false, false);
	SetEntityRotation(ped, camInfo.rotation.x, camInfo.rotation.y, camInfo.rotation.z, 2, false);

	await Delay(250);

	emitNet('takeScreenshot', `${pedType}_${type == 'PROPS' ? 'prop_' : ''}${component}_${drawable}${texture ? `_${texture}`: ''}`, 'clothing');
	await Delay(2000);
	return;
}

function SetPedOnGround() {
	const [x, y, z] = GetEntityCoords(ped, false);
	const [retval, ground] = GetGroundZFor_3dCoord(x, y, z, 0, false);
	SetEntityCoords(ped, x, y, ground, false, false, false, false);
}

function ClearAllPedProps() {
	for (const prop of Object.keys(config.cameraSettings.PROPS)) {
		ClearPedProp(ped, parseInt(prop));
	}
}

async function ResetPedComponents() {
	if (config.debug) console.log(`DEBUG: Resetting Ped Components`);

	SetPedDefaultComponentVariation(ped);

	await Delay(150);

	SetPedComponentVariation(ped, 0, 0, 1, 0); // Head
	SetPedComponentVariation(ped, 1, 0, 0, 0); // Mask
	SetPedComponentVariation(ped, 2, -1, 0, 0); // Hair
	SetPedComponentVariation(ped, 7, 0, 0, 0); // Accessories
	SetPedComponentVariation(ped, 5, 0, 0, 0); // Bags
	SetPedComponentVariation(ped, 6, -1, 0, 0); // Shoes
	SetPedComponentVariation(ped, 9, 0, 0, 0); // Armor
	SetPedComponentVariation(ped, 3, -1, 0, 0); // Torso
	SetPedComponentVariation(ped, 8, -1, 0, 0); // Undershirt
	SetPedComponentVariation(ped, 4, -1, 0, 0); // Legs
	SetPedComponentVariation(ped, 11, -1, 0, 0); // Top
	SetPedHairColor(ped, 45, 15);

	ClearAllPedProps();

	return;
}

function setWeatherTime() {
	if (config.debug) console.log(`DEBUG: Setting Weather & Time`);
	SetRainLevel(0.0);
	SetWeatherTypePersist('EXTRASUNNY');
	SetWeatherTypeNow('EXTRASUNNY');
	SetWeatherTypeNowPersist('EXTRASUNNY');
	NetworkOverrideClockTime(18, 0, 0);
	NetworkOverrideClockMillisecondsPerGameMinute(1000000);
}

function stopWeatherResource() {
	if (config.debug) console.log(`DEBUG: Stopping Weather Resource`);
	if ((GetResourceState('qb-weathersync') == 'started') || (GetResourceState('qbx_weathersync') == 'started')) {
		TriggerEvent('qb-weathersync:client:DisableSync');
		return true;
	} else if (GetResourceState('weathersync') == 'started') {
		TriggerEvent('weathersync:toggleSync')
		return true;
	} else if (GetResourceState('esx_wsync') == 'started') {
		SendNUIMessage({
			error: 'weathersync',
		});
		return false;
	} else if (GetResourceState('cd_easytime') == 'started') {
		TriggerEvent('cd_easytime:PauseSync', false)
		return true;
	} else if (GetResourceState('vSync') == 'started' || GetResourceState('Renewed-Weathersync') == 'started') {
		TriggerEvent('vSync:toggle', false)
		return true;
	}
	return true;
}

function startWeatherResource() {
	if (config.debug) console.log(`DEBUG: Starting Weather Resource again`);
	if ((GetResourceState('qb-weathersync') == 'started') || (GetResourceState('qbx_weathersync') == 'started')) {
		TriggerEvent('qb-weathersync:client:EnableSync');
	} else if (GetResourceState('weathersync') == 'started') {
		TriggerEvent('weathersync:toggleSync')
	} else if (GetResourceState('cd_easytime') == 'started') {
		TriggerEvent('cd_easytime:PauseSync', true)
	} else if (GetResourceState('vSync') == 'started' || GetResourceState('Renewed-Weathersync') == 'started') {
		TriggerEvent('vSync:toggle', true)
	}
}

async function LoadComponentVariation(ped, component, drawable, texture) {
	texture = texture || 0;

	if (config.debug) console.log(`DEBUG: Loading Component Variation: ${component} ${drawable} ${texture}`);

	SetPedPreloadVariationData(ped, component, drawable, texture);
	while (!HasPedPreloadVariationDataFinished(ped)) {
		await Delay(50);
	}
	SetPedComponentVariation(ped, component, drawable, texture, 0);

	return;
}

async function LoadPropVariation(ped, component, prop, texture) {
	texture = texture || 0;

	if (config.debug) console.log(`DEBUG: Loading Prop Variation: ${component} ${prop} ${texture}`);

	SetPedPreloadPropData(ped, component, prop, texture);
	while (!HasPedPreloadPropDataFinished(ped)) {
		await Delay(50);
	}
	ClearPedProp(ped, component);
	SetPedPropIndex(ped, component, prop, texture, 0);

	return;
}

RegisterCommand('screenshot', async (source, args) => {
	const modelHashes = [GetHashKey('mp_m_freemode_01'), GetHashKey('mp_f_freemode_01')];

	SendNUIMessage({
		start: true,
	});

	if (!stopWeatherResource()) return;

	DisableIdleCamera(true);

	await Delay(100);

	for (const modelHash of modelHashes) {
		if (IsModelValid(modelHash)) {
			if (!HasModelLoaded(modelHash)) {
				RequestModel(modelHash);
				while (!HasModelLoaded(modelHash)) {
					await Delay(100);
				}
			}

			SetPlayerModel(playerId, modelHash);
			await Delay(150);
			SetModelAsNoLongerNeeded(modelHash);

			await Delay(150);

			ped = PlayerPedId();

			const pedType = modelHash === GetHashKey('mp_m_freemode_01') ? 'male' : 'female';
			SetEntityRotation(ped, config.greenScreenRotation.x, config.greenScreenRotation.y, config.greenScreenRotation.z, 0, false);
			SetEntityCoordsNoOffset(ped, config.greenScreenPosition.x, config.greenScreenPosition.y, config.greenScreenPosition.z, false, false, false);
			FreezeEntityPosition(ped, true);
			await Delay(50);
			SetPlayerControl(playerId, false);

			interval = setInterval(() => {
				ClearPedTasksImmediately(ped);
				if (hideHead) SetPedResetFlag(ped, 166, true);
			}, 1);

			for (const type of Object.keys(config.cameraSettings)) {
				for (const stringComponent of Object.keys(config.cameraSettings[type])) {
					await ResetPedComponents();
					await Delay(150);
					const component = parseInt(stringComponent);
					if (type === 'CLOTHING') {
						const drawableVariationCount = GetNumberOfPedDrawableVariations(ped, component);
						for (let drawable = 0; drawable < drawableVariationCount; drawable++) {
							SendNUIMessage({
								type: config.cameraSettings[type][component].name,
								value: drawable,
								max: drawableVariationCount,
							});
							await LoadComponentVariation(ped, component, drawable);
							await takeScreenshotForComponent(pedType, type, component, drawable);
						}
					} else if (type === 'PROPS') {
						const propVariationCount = GetNumberOfPedPropDrawableVariations(ped, component);
						for (let prop = 0; prop < propVariationCount; prop++) {
							SendNUIMessage({
								type: config.cameraSettings[type][component].name,
								value: prop,
								max: propVariationCount,
							});

							await LoadPropVariation(ped, component, prop);
							await takeScreenshotForComponent(pedType, type, component, prop);
						}
					}
				}
			}
			SetModelAsNoLongerNeeded(modelHash);
			SetPlayerControl(playerId, true);
			FreezeEntityPosition(ped, false);
			clearInterval(interval);
		}
	}
	SetPedOnGround();
	startWeatherResource();
	SendNUIMessage({
		end: true,
	});
	DestroyAllCams(true);
	DestroyCam(cam, true);
	RenderScriptCams(false, false, 0, true, false, 0);
	camInfo = null;
	cam = null;
});

RegisterCommand('customscreenshot', async (source, args) => {

	const type = args[2].toUpperCase();
	const component = parseInt(args[0]);
	let drawable = args[1].toLowerCase() == 'all' ? args[1].toLowerCase() : parseInt(args[1]);
	let prop = args[1].toLowerCase() == 'all' ? args[1].toLowerCase() : parseInt(args[1]);
	const gender = args[3].toLowerCase();
	let cameraSettings;

	let modelHashes;

	if (gender == 'male') {
		modelHashes = [GetHashKey('mp_m_freemode_01')];
	} else if (gender == 'female') {
		modelHashes = [GetHashKey('mp_f_freemode_01')];
	} else {
		modelHashes = [GetHashKey('mp_m_freemode_01'), GetHashKey('mp_f_freemode_01')];
	}

	if (args[4] != null) {
		let cameraSettings = ''
		for (let i = 4; i < args.length; i++) {
			cameraSettings += args[i] + ' ';
		}

		cameraSettings = JSON.parse(cameraSettings);
	}

	if (!stopWeatherResource()) return;

	DisableIdleCamera(true);

	await Delay(100);

	for (const modelHash of modelHashes) {
		if (IsModelValid(modelHash)) {
			if (!HasModelLoaded(modelHash)) {
				RequestModel(modelHash);
				while (!HasModelLoaded(modelHash)) {
					await Delay(100);
				}
			}

			SetPlayerModel(playerId, modelHash);
			await Delay(150);
			SetModelAsNoLongerNeeded(modelHash);

			await Delay(150);

			ped = PlayerPedId();

			interval = setInterval(() => {
				ClearPedTasksImmediately(ped);
				if (hideHead) SetPedResetFlag(ped, 166, true);
			}, 1);

			const pedType = modelHash === GetHashKey('mp_m_freemode_01') ? 'male' : 'female';
			SetEntityRotation(ped, config.greenScreenRotation.x, config.greenScreenRotation.y, config.greenScreenRotation.z, 0, false);
			SetEntityCoordsNoOffset(ped, config.greenScreenPosition.x, config.greenScreenPosition.y, config.greenScreenPosition.z, false, false, false);
			FreezeEntityPosition(ped, true);
			await Delay(50);
			SetPlayerControl(playerId, false);

			ResetPedComponents();
			await Delay(150);

			if (drawable == 'all') {
				SendNUIMessage({
					start: true,
				});
				if (type === 'CLOTHING') {
					const drawableVariationCount = GetNumberOfPedDrawableVariations(ped, component);
					for (drawable = 0; drawable < drawableVariationCount; drawable++) {
						SendNUIMessage({
							type: config.cameraSettings[type][component].name,
							value: drawable,
							max: drawableVariationCount,
						});
						await LoadComponentVariation(ped, component, drawable);
						await takeScreenshotForComponent(pedType, type, component, drawable, null, cameraSettings);
					}
				} else if (type === 'PROPS') {
					const propVariationCount = GetNumberOfPedPropDrawableVariations(ped, component);
					for (prop = 0; prop < propVariationCount; prop++) {
						SendNUIMessage({
							type: config.cameraSettings[type][component].name,
							value: prop,
							max: propVariationCount,
						});

						await LoadPropVariation(ped, component, prop);
						await takeScreenshotForComponent(pedType, type, component, prop, null, cameraSettings);
					}
				}
			} else if (!isNaN(drawable)) {
				if (type === 'CLOTHING') {
					await LoadComponentVariation(ped, component, drawable);
					await takeScreenshotForComponent(pedType, type, component, drawable, null, cameraSettings);
				} else if (type === 'PROPS') {
					await LoadPropVariation(ped, component, prop);
					await takeScreenshotForComponent(pedType, type, component, prop, null, cameraSettings);
				}
			}
			SetPlayerControl(playerId, true);
			FreezeEntityPosition(ped, false);
			clearInterval(interval);
		}
	}
	SetPedOnGround();
	startWeatherResource();
	SendNUIMessage({
		end: true,
	});
	DestroyAllCams(true);
	DestroyCam(cam, true);
	RenderScriptCams(false, false, 0, true, false, 0);
	camInfo = null;
	cam = null;
});

setImmediate(() => {
	emit('chat:addSuggestions', [
		{
			name: '/screenshot',
			help: 'generate clothing screenshots',
		},
		{
			name: '/customscreenshot',
			help: 'generate custom clothing screenshots',
			params: [
				{name:"component", help:"The clothing component to take a screenshot of"},
				{name:"drawable/all", help:"The drawable variation to take a screenshot of"},
				{name:"props/clothing", help:"PROPS or CLOTHING"},
				{name:"male/female/both", help:"The gender to take a screenshot of"},
				{name:"camera settings", help:"The camera settings to use for the screenshot (optional)"},
			]
		}
	])
});

on('onResourceStop', (resName) => {
	if (GetCurrentResourceName() != resName) return;

	startWeatherResource();
	clearInterval(interval);
	SetPlayerControl(playerId, true);
	FreezeEntityPosition(ped, false);
});
