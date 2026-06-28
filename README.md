# um-thumbnail-clothing

fork [fivem-greenscreener​](https://github.com/Bentix-cs/fivem-greenscreener)

## Installation

Simply clone the repository and place the resource in your resources folder.

**Do not use a subfolder like `resources/[scripts]` as it will cause the script to malfunction.**

### Usage

Execute the command `/screenshot` to initiate the clothing screenshot process.
Be patient as it may take some time to complete, and it's advisable not to interfere with your PC during this operation.


### Screenshot specific clothing

Utilize the command `/customscreenshot` to capture a specific clothing item, with optional custom camera settings specified in the format outlined in `config.json`.

`/customscreenshot [component] [drawable/all] [props/clothing] [male/female/both] [camerasettings(optional)]`

`/customscreenshot 11 17 clothing male {"fov": 55, "rotation": { "x": 0, "y": 0, "z": 15}, "zPos": 0.26}`

`/customscreenshot 11 all clothing male {"fov": 55, "rotation": { "x": 0, "y": 0, "z": 15}, "zPos": 0.26}`

## Dependencies

- [screencapture](https://github.com/itschip/screencapture)
- yarn

## Offical Repo
- [fivem-greenscreener​](https://github.com/Bentix-cs/fivem-greenscreener​)
