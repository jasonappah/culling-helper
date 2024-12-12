# culling-helper

A CLI to help me with culling photos on a network drive. Written in [Deno](https://deno.land).

## Desired Workflow

1. Run `culling-helper` on the server to convert the RAW photos on the network drive to JPEGs.
  - Probably should store a mapping of the original RAW file to the converted JPG file in a JSON file.
  - Relevant tools: exiftool, darktable (has cli), imagemagick ([may not work](https://askubuntu.com/a/1337782), sips (mac specific), libraw (fork of dcraw), RawTherapee (has cli, also may be the fastest option)
  - Debating whether just to use the JPG preview embedded in the RAW file as is or whether to further compress it
  - There needs to be an option to divide the converted JPGs into batches based on a size limit (e.g. 10GB) because I only have so much free space on my computer :skull:.
2. I copy a batch of the JPGs from the network drive to my computer.
3. I rate images as usual from my computer using [Bridge](https://www.adobe.com/products/bridge.html).
4. Run `culling-helper` on the images I've rated on my computer to create a file called `ratings_<batch>.json` that contains the ratings.
5. I copy the `ratings_<batch>.json` file from my computer to the network drive.
6. I run `culling-helper` on the server to apply the ratings from the copied `ratings_<batch>.json` file to the original corresponding RAWs.
7. Delete the working batch of JPGs from my computer.
8. Repeat steps 2-7 until I've rated all the photos in the folder.
9. Delete all the JPGs and JSON files from the network drive.
