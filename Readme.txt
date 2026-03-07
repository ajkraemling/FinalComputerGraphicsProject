For our project, we made a scene with a playable character, based off of hollow knight. 

To run this program:
Ensure you have npm installed
Run `npx serve` in terminal
Open localhost:3000, select CS4731-Pjt2-Starter-main
Enjoy!

Alternatively, use the link below:
https://ajkraemling.github.io/FinalComputerGraphicsProject/

As a part of this project, you can:
WASD - move
SPACE - jump
CLICK + DRAG - Look around
CLICK - Swing sword
QE - Make character look left and right, then rotate 
????? - Toggle shadows
L - Toggles off diffuse, then toggles off specular, then both, then turns off the light
JK - subdivies yellow square

We met the criteria for this project by adding:
1. Complex shapes (hollow knight character, floor, and buildings)
2. Model transformations by running and jumping, as well as rotating with mouse
3. Point light with phong shading from door
4. Spot light from lamp
5. Dog is textured, with a default texture
6. Camera moves with hollow knight and rotates with mouse click and drag
7. Hollow knight moves as the parent, head moves with body as child, sword moves with head rotation
8. Shadow from Lamp on characters
9. Reflection from door
10. Refraction from other door
11. Skybox
12.
  a - animation controlled by WASDQE and mouse
  b - ?????? Toggles shadows
  c - L Toggles spot light 
  d - Control camera movement with keyboard or mouse


We faced a lot of challenges importing models and textures, particularly getting the textures to work from Maya. We also faced some difficulties with certain models being too complex and crashing the site.

We each contributed equally to this project. Our contributions are as follows:
Alexander Kraemling
- General code set up and rendering obj's + mtl's
- Skybox
- Initial keyboard/ movement controls, jumping

<<<<<<< HEAD
Cameron
-  Lighting(Relfection/refraction/Shading/Shadows) 
=======
Cameron Gleaton
- 
>>>>>>> 44defeb924f325ac2ffc3b644351055d63f7c02e

Avikshit Pal
- Fixed models for site
- Hierarchical model of body, head, sword
- Mouse controls for character rotation

Extra Credit
JK to subdivide sphere!
Our jumping decelerates the character after setting an initial upward jump force
Our character collides with the floor and the top of objects, preventing him from falling infinitely
